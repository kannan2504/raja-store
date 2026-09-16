import path from 'node:path'
import { HttpError } from '../utils/httpError'

const maxSize = 5 * 1024 * 1024
const signatures: Record<string, (buffer: Buffer) => boolean> = {
  jpg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  jpeg: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  png: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  webp: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
}

export function validatePaymentProof(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
  if (file.size > maxSize) throw new HttpError(400, 'INVALID_PAYMENT_PROOF', 'Payment proof must be 5 MB or smaller.')
  const extension = path.extname(file.originalname).slice(1).toLowerCase()
  if (!Object.prototype.hasOwnProperty.call(signatures, extension)) throw new HttpError(400, 'INVALID_PAYMENT_PROOF', 'Payment proof must be a JPG, JPEG, PNG, or WEBP image.')
  const expectedMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
  if (file.mimetype !== expectedMime) throw new HttpError(400, 'INVALID_PAYMENT_PROOF', 'Payment proof file type is invalid.')
  if (!signatures[extension](file.buffer)) throw new HttpError(400, 'INVALID_PAYMENT_PROOF', 'Payment proof image data is invalid.')
  return extension
}
