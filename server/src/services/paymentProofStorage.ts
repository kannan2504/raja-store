import { createReadStream, readdirSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export type StoredPaymentProof = { proofFileId: string; extension: string }

export interface PaymentProofStorage {
  upload(file: { buffer: Buffer; extension: string }): Promise<StoredPaymentProof>
  get(proofFileId: string): ReturnType<typeof createReadStream>
  delete(proofFileId: string): Promise<void>
}

const privateDirectory = path.resolve(process.cwd(), 'server/private/payment-proofs')

export class LocalPrivatePaymentProofStorage implements PaymentProofStorage {
  private readonly files = new Map<string, string>()

  async upload(file: { buffer: Buffer; extension: string }) {
    await mkdir(privateDirectory, { recursive: true })
    const proofFileId = randomUUID()
    const filename = `${proofFileId}.${file.extension}`
    await writeFile(path.join(privateDirectory, filename), file.buffer, { flag: 'wx', mode: 0o600 })
    this.files.set(proofFileId, filename)
    return { proofFileId, extension: file.extension }
  }

  get(proofFileId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(proofFileId)) throw new Error('Invalid proof file ID')
    const filename = this.files.get(proofFileId) ?? readdirSync(privateDirectory, { encoding: 'utf8' }).find((file) => file.startsWith(`${proofFileId}.`))
    if (!filename) throw new Error('Payment proof is unavailable')
    return createReadStream(path.join(privateDirectory, filename))
  }

  async delete(proofFileId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(proofFileId)) return
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(privateDirectory).catch(() => [] as string[]))
    await Promise.all(files.filter((file) => file.startsWith(`${proofFileId}.`)).map((file) => unlink(path.join(privateDirectory, file))))
    this.files.delete(proofFileId)
  }
}
