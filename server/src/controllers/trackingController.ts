import type { Request, Response } from 'express'
import { z } from 'zod'
import type { OrderService } from '../services/orderService'
import { HttpError } from '../utils/httpError'

const trackingSchema = z.object({ orderId: z.string().regex(/^ORD-\d{4}-\d{6}$/), phone: z.string().regex(/^[6-9]\d{9}$/) })

export function makeTrackingController(orderService: OrderService) {
  return async (request: Request, response: Response) => {
    try {
      const input = trackingSchema.parse(request.body)
      const order = await orderService.trackOrder(input.orderId, input.phone)
      return response.json({ success: true, order })
    } catch (error) {
      if (error instanceof HttpError || error instanceof z.ZodError) return response.status(400).json({ success: false, code: 'ORDER_VERIFICATION_FAILED', message: 'Unable to verify the order details.' })
      return response.status(500).json({ success: false, code: 'ORDER_VERIFICATION_FAILED', message: 'Unable to verify the order details.' })
    }
  }
}
