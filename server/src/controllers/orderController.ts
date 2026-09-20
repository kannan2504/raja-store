import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import { createOrderSchema, makeIdempotencyKey, OrderService } from '../services/orderService'
import type { PaymentProofStorage } from '../services/paymentProofStorage'
import { validatePaymentProof } from '../services/imageValidation'
import { HttpError } from '../utils/httpError'

export function makeCreateOrderController(orderService: OrderService, storage: PaymentProofStorage) {
  return async (request: Request, response: Response) => {
    let storedProofId: string | undefined
    try {
      const isMultipart = Boolean(request.is('multipart/form-data'))
      const body = isMultipart
        ? {
            ...request.body,
            items: typeof request.body?.items === 'string' ? JSON.parse(request.body.items) : request.body?.items,
            customer: typeof request.body?.customer === 'string' ? JSON.parse(request.body.customer) : request.body?.customer,
            payment: {
              method: request.body?.paymentMethod,
              utrNumber: request.body?.utrNumber,
            },
          }
        : {
            ...request.body,
            payment: { ...request.body?.payment },
          }

      // Ensure client cannot inject proofFileId directly
      if (body.payment && typeof body.payment === 'object') {
        delete body.payment.proofFileId
      }

      const paymentMethod = body.payment?.method ?? (isMultipart ? request.body?.paymentMethod : undefined)

      if (paymentMethod === 'manual_upi') {
        if (!request.file) {
          throw new HttpError(400, 'PAYMENT_PROOF_REQUIRED', 'Please provide your UPI transaction ID and payment screenshot.')
        }
        const extension = validatePaymentProof(request.file)
        storedProofId = (await storage.upload({ buffer: request.file.buffer, extension })).proofFileId
        body.payment.proofFileId = storedProofId
      }

      const input = createOrderSchema.parse(body)
      const order = await orderService.createOrder(input, makeIdempotencyKey(request.header('Idempotency-Key') ?? request.header('X-Request-Id')))
      response.status(201).json({ success: true, order: { orderId: order.orderId, total: order.pricing.total, status: order.orderStatus, paymentMethod: order.payment.method, paymentStatus: order.payment.status } })
    } catch (error) {
      if (storedProofId) await storage.delete(storedProofId)
      if (error instanceof SyntaxError) return response.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Please check the order details and try again.' })
      if (error instanceof ZodError) return response.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Please check the order details and try again.' })
      if (error instanceof HttpError) return response.status(error.status).json({ success: false, code: error.code, message: error.message })
      console.error('[OrderCreationError]', {
        requestId: response.locals.requestId,
        name: error instanceof Error ? error.name : 'UnknownError',
      })
      return response.status(500).json({ success: false, code: 'ORDER_CREATION_FAILED', message: 'Unable to process your order. Please try again.' })
    }
  }
}
