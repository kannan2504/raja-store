import { createReadStream } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { HttpError } from '../utils/httpError'

const maxImageSize = 5 * 1024 * 1024
const signatures: Record<string, (buffer: Buffer) => boolean> = {
  jpg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  jpeg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  png: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  webp: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
}

export type ProductImageFile = { originalname: string; mimetype: string; size: number; buffer: Buffer }
export interface ProductImageStorage { upload(file: ProductImageFile): Promise<string>; get(reference: string): { stream: ReturnType<typeof createReadStream>; contentType: string }; delete(reference: string): Promise<void> }

const directory = path.resolve(process.cwd(), 'server/private/product-images')

export class LocalProductImageStorage implements ProductImageStorage {
  async upload(file: ProductImageFile) {
    if (file.size > maxImageSize) throw new HttpError(400, 'INVALID_PRODUCT_IMAGE', 'Product images must be 5 MB or smaller.')
    const extension = path.extname(file.originalname).slice(1).toLowerCase()
    const expectedMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
    if (!Object.prototype.hasOwnProperty.call(signatures, extension) || file.mimetype !== expectedMime || !signatures[extension](file.buffer)) throw new HttpError(400, 'INVALID_PRODUCT_IMAGE', 'Product image must be a valid JPG, JPEG, PNG, or WEBP image.')
    await mkdir(directory, { recursive: true })
    const reference = `${randomUUID()}.${extension}`
    await writeFile(path.join(directory, reference), file.buffer, { flag: 'wx', mode: 0o600 })
    return reference
  }

  get(reference: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(reference)) throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Product image not found.')
    const extension = reference.split('.').pop()!.toLowerCase()
    return { stream: createReadStream(path.join(directory, reference)), contentType: extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}` }
  }

  async delete(reference: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(reference)) return
    await unlink(path.join(directory, reference)).catch(() => undefined)
  }
}
