import { createReadStream } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'
import { HttpError } from '../utils/httpError'

const maxImageSize = 5 * 1024 * 1024
const signatures: Record<string, (buffer: Buffer) => boolean> = {
  jpg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  jpeg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  png: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  webp: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
}

export type ProductImageFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export type ProductImageResult =
  | { stream: ReturnType<typeof createReadStream>; contentType: string; redirectUrl?: never }
  | { redirectUrl: string; stream?: never; contentType?: never }

export interface ProductImageStorage {
  upload(file: ProductImageFile): Promise<string>
  get(reference: string): ProductImageResult
  delete(reference: string): Promise<void>
}

export function validateProductImageFile(file: ProductImageFile): void {
  if (file.size > maxImageSize) {
    throw new HttpError(400, 'INVALID_PRODUCT_IMAGE', 'Product images must be 5 MB or smaller.')
  }
  const extension = path.extname(file.originalname).slice(1).toLowerCase()
  const expectedMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
  if (!Object.prototype.hasOwnProperty.call(signatures, extension) || file.mimetype !== expectedMime || !signatures[extension](file.buffer)) {
    throw new HttpError(400, 'INVALID_PRODUCT_IMAGE', 'Product image must be a valid JPG, JPEG, PNG, or WEBP image.')
  }
}

export function isValidProductImageReference(value: unknown): value is string {
  if (typeof value !== 'string') return false
  // Legacy local UUID format: 36-character uuid.ext
  if (/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(value)) return true
  // Cloudinary reference format: cloudinary:<public_id>
  if (/^cloudinary:[a-zA-Z0-9_\-\/]+$/i.test(value)) return true
  // Full HTTP/HTTPS URLs (if any exist)
  if (/^https?:\/\//i.test(value)) return true
  return false
}

export function serializeProductImage(
  image: string,
  productId: string,
  cloudName = env.CLOUDINARY_CLOUD_NAME,
): string {
  if (!image) return image
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image
  }
  if (image.startsWith('cloudinary:')) {
    const publicId = image.slice('cloudinary:'.length)
    if (cloudName?.trim()) {
      return `https://res.cloudinary.com/${cloudName.trim()}/image/upload/${publicId}`
    }
  }
  return `/api/products/${productId}/images/${image}`
}

const localDirectory = path.resolve(process.cwd(), 'server/private/product-images')

export class LocalProductImageStorage implements ProductImageStorage {
  async upload(file: ProductImageFile): Promise<string> {
    validateProductImageFile(file)
    const extension = path.extname(file.originalname).slice(1).toLowerCase()
    await mkdir(localDirectory, { recursive: true })
    const reference = `${randomUUID()}.${extension}`
    await writeFile(path.join(localDirectory, reference), file.buffer, { flag: 'wx', mode: 0o600 })
    return reference
  }

  get(reference: string): ProductImageResult {
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(reference)) {
      throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Product image not found.')
    }
    const extension = reference.split('.').pop()!.toLowerCase()
    return {
      stream: createReadStream(path.join(localDirectory, reference)),
      contentType: extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`,
    }
  }

  async delete(reference: string): Promise<void> {
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(reference)) return
    await unlink(path.join(localDirectory, reference)).catch(() => undefined)
  }
}

export type CloudinaryConfigOptions = {
  cloudName: string
  apiKey: string
  apiSecret: string
}

export class CloudinaryProductImageStorage implements ProductImageStorage {
  private localFallback = new LocalProductImageStorage()
  private options: CloudinaryConfigOptions

  constructor(options: CloudinaryConfigOptions) {
    this.options = options
    cloudinary.config({
      cloud_name: options.cloudName,
      api_key: options.apiKey,
      api_secret: options.apiSecret,
      secure: true,
    })
  }

  async upload(file: ProductImageFile): Promise<string> {
    validateProductImageFile(file)
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'raja-store/products',
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new HttpError(500, 'UPLOAD_FAILED', 'Failed to upload image to Cloudinary.'))
          }
          resolve(`cloudinary:${result.public_id}`)
        },
      )
      uploadStream.end(file.buffer)
    })
  }

  get(reference: string): ProductImageResult {
    if (reference.startsWith('cloudinary:')) {
      const publicId = reference.slice('cloudinary:'.length)
      if (!publicId || !/^[a-zA-Z0-9_\-\/]+$/.test(publicId)) {
        throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Product image not found.')
      }
      return {
        redirectUrl: `https://res.cloudinary.com/${this.options.cloudName}/image/upload/${publicId}`,
      }
    }
    // Legacy local UUID fallback
    return this.localFallback.get(reference)
  }

  async delete(reference: string): Promise<void> {
    if (reference.startsWith('cloudinary:')) {
      const publicId = reference.slice('cloudinary:'.length)
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
      } catch {
        // Suppress deletion errors so consumer flow continues
      }
      return
    }
    // Legacy local UUID deletion
    await this.localFallback.delete(reference)
  }
}

export function isCloudinaryConfigured(
  config: { CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string } = env,
): boolean {
  return Boolean(
    config.CLOUDINARY_CLOUD_NAME?.trim() &&
    config.CLOUDINARY_API_KEY?.trim() &&
    config.CLOUDINARY_API_SECRET?.trim(),
  )
}

export function createProductImageStorage(
  config: { CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string } = env,
): ProductImageStorage {
  if (isCloudinaryConfigured(config)) {
    return new CloudinaryProductImageStorage({
      cloudName: config.CLOUDINARY_CLOUD_NAME!.trim(),
      apiKey: config.CLOUDINARY_API_KEY!.trim(),
      apiSecret: config.CLOUDINARY_API_SECRET!.trim(),
    })
  }
  return new LocalProductImageStorage()
}
