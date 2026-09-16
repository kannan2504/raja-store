import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { makeCreateOrderController } from '../controllers/orderController'
import { makeTrackingController } from '../controllers/trackingController'
import type { OrderRepository } from '../repositories/orderRepository'
import type { ProductRepository } from '../repositories/productRepository'
import { LocalPrivatePaymentProofStorage, type PaymentProofStorage } from '../services/paymentProofStorage'
import { OrderService } from '../services/orderService'
import { AdminOrderNotificationService, DevelopmentWhatsAppProvider, GmailSmtpEmailProvider, OrderNotificationFormatter } from '../services/orderNotification'

export function createOrderRoutes(products: ProductRepository, orders: OrderRepository, proofStorage: PaymentProofStorage = new LocalPrivatePaymentProofStorage()) {
  const notifications = new AdminOrderNotificationService(new OrderNotificationFormatter(products), new DevelopmentWhatsAppProvider(), new GmailSmtpEmailProvider())
  const service = new OrderService(products, orders, notifications)
  const router = Router()
  const orderRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, code: 'RATE_LIMITED', message: 'Too many order attempts. Please try again later.' } })
  const trackingRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, code: 'RATE_LIMITED', message: 'Too many tracking attempts. Please try again later.' } })
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } })
  router.post('/', orderRateLimit, upload.single('paymentProof'), makeCreateOrderController(service, proofStorage))
  router.post('/track', trackingRateLimit, makeTrackingController(service))
  return router
}
