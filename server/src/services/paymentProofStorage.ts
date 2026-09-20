import { createReadStream, readdirSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import path from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'
import { isCloudinaryConfigured } from './productImageStorage'
import { HttpError } from '../utils/httpError'

export type StoredPaymentProof = { proofFileId: string; extension: string }

export type PaymentProofStreamResult = {
  stream: NodeJS.ReadableStream
  contentType: string
}

export interface PaymentProofStorage {
  upload(file: { buffer: Buffer; extension: string }): Promise<StoredPaymentProof>
  get(proofFileId: string): Promise<PaymentProofStreamResult>
  delete(proofFileId: string): Promise<void>
}

const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const privateDirectory = path.resolve(process.cwd(), 'server/private/payment-proofs')

export class LocalPrivatePaymentProofStorage implements PaymentProofStorage {
  private readonly files = new Map<string, string>()

  async upload(file: { buffer: Buffer; extension: string }): Promise<StoredPaymentProof> {
    await mkdir(privateDirectory, { recursive: true })
    const proofFileId = randomUUID()
    const filename = `${proofFileId}.${file.extension}`
    await writeFile(path.join(privateDirectory, filename), file.buffer, { flag: 'wx', mode: 0o600 })
    this.files.set(proofFileId, filename)
    return { proofFileId, extension: file.extension }
  }

  async get(proofFileId: string): Promise<PaymentProofStreamResult> {
    if (!/^[0-9a-f-]{36}$/i.test(proofFileId)) {
      throw new HttpError(404, 'PROOF_NOT_FOUND', 'Invalid proof file ID.')
    }
    const filename = this.files.get(proofFileId) ?? readdirSync(privateDirectory, { encoding: 'utf8' }).find((file) => file.startsWith(`${proofFileId}.`))
    if (!filename) {
      throw new HttpError(404, 'PROOF_NOT_FOUND', 'Payment proof is unavailable.')
    }
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'png'
    return {
      stream: createReadStream(path.join(privateDirectory, filename)),
      contentType: mimeTypes[ext] ?? 'image/jpeg',
    }
  }

  async delete(proofFileId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(proofFileId)) return
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(privateDirectory).catch(() => [] as string[]))
    await Promise.all(files.filter((file) => file.startsWith(`${proofFileId}.`)).map((file) => unlink(path.join(privateDirectory, file))))
    this.files.delete(proofFileId)
  }
}

export type CloudinaryProofConfig = {
  cloudName: string
  apiKey: string
  apiSecret: string
}

export class CloudinaryPrivatePaymentProofStorage implements PaymentProofStorage {
  private localFallback = new LocalPrivatePaymentProofStorage()
  private options: CloudinaryProofConfig

  constructor(options: CloudinaryProofConfig) {
    this.options = options
    cloudinary.config({
      cloud_name: options.cloudName,
      api_key: options.apiKey,
      api_secret: options.apiSecret,
      secure: true,
    })
  }

  async upload(file: { buffer: Buffer; extension: string }): Promise<StoredPaymentProof> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'raja-store/payment-proofs',
          resource_type: 'image',
          type: 'authenticated',
        },
        (error, result) => {
          if (error || !result) {
            return reject(error ?? new HttpError(500, 'UPLOAD_FAILED', 'Failed to upload payment proof.'))
          }
          resolve({
            proofFileId: `cloudinary:${result.public_id}`,
            extension: file.extension,
          })
        },
      )
      uploadStream.end(file.buffer)
    })
  }

  async get(proofFileId: string): Promise<PaymentProofStreamResult> {
    if (proofFileId.startsWith('cloudinary:')) {
      const publicId = proofFileId.slice('cloudinary:'.length)
      if (
        !publicId ||
        !publicId.startsWith('raja-store/payment-proofs/') ||
        !/^[a-zA-Z0-9_\-\/]+$/.test(publicId)
      ) {
        throw new HttpError(404, 'PROOF_NOT_FOUND', 'Payment proof not found.')
      }

      const signedUrl = cloudinary.url(publicId, {
        type: 'authenticated',
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 60,
      })

      const res = await fetch(signedUrl)
      if (!res.ok) {
        throw new HttpError(404, 'PROOF_NOT_FOUND', 'Payment proof is unavailable.')
      }

      const contentType = res.headers.get('content-type') ?? 'image/jpeg'
      const buffer = Buffer.from(await res.arrayBuffer())
      return {
        stream: Readable.from(buffer),
        contentType,
      }
    }

    // Fallback for legacy local proofs
    return this.localFallback.get(proofFileId)
  }

  async delete(proofFileId: string): Promise<void> {
    if (proofFileId.startsWith('cloudinary:')) {
      const publicId = proofFileId.slice('cloudinary:'.length)
      if (!publicId.startsWith('raja-store/payment-proofs/')) return
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: 'image',
          type: 'authenticated',
          invalidate: true,
        })
      } catch {
        // Suppress deletion error so consumer flow continues
      }
      return
    }

    await this.localFallback.delete(proofFileId)
  }
}

export function createPaymentProofStorage(
  config: { CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string } = env,
): PaymentProofStorage {
  if (isCloudinaryConfigured(config)) {
    return new CloudinaryPrivatePaymentProofStorage({
      cloudName: config.CLOUDINARY_CLOUD_NAME!.trim(),
      apiKey: config.CLOUDINARY_API_KEY!.trim(),
      apiSecret: config.CLOUDINARY_API_SECRET!.trim(),
    })
  }
  return new LocalPrivatePaymentProofStorage()
}
