import type { Request, Response } from 'express'
import { OrderModel } from '../models/orderDocument'
import type { PaymentProofStorage } from '../services/paymentProofStorage'

export function makeAdminProofController(storage: PaymentProofStorage) {
  return async (request: Request, response: Response) => {
    const order = await OrderModel.findOne({ orderId: request.params.orderId }).lean()
    if (!order?.payment?.proofFileId) return response.status(404).json({ success: false, code: 'PROOF_NOT_FOUND', message: 'Payment proof not found.' })
    try { storage.get(order.payment.proofFileId).pipe(response) } catch { response.status(404).json({ success: false, code: 'PROOF_NOT_FOUND', message: 'Payment proof not found.' }) }
  }
}
