import type { Request, Response } from 'express'
import { env } from '../config/env'

export function getPaymentConfig(_request: Request, response: Response) {
  response.json({ success: true, payment: { storeName: env.STORE_NAME, upiId: env.STORE_UPI_ID, qrUrl: env.STORE_UPI_QR_URL } })
}
