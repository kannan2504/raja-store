import { Router } from 'express'
import multer from 'multer'

import {
  getAdminOrder,
  listAdminOrders,
  listAdminProducts,
  updateAdminOrder,
  updateAdminPayment,
  updateAdminStock,
  makeAdminProductController,
} from '../controllers/adminController'
import { makeAdminProofController } from '../controllers/adminProofController'
import { requireAdmin } from '../middleware/adminAuth'
import { LocalProductImageStorage } from '../services/productImageStorage'
import type { PaymentProofStorage } from '../services/paymentProofStorage'

export function createAdminRoutes(paymentProofStorage: PaymentProofStorage) {
  const adminRoutes = Router()

  adminRoutes.use(requireAdmin)

  const productUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 5,
    },
  })

  const productImages = makeAdminProductController(
    new LocalProductImageStorage(),
  )

  adminRoutes.get('/orders', listAdminOrders)

  adminRoutes.get('/orders/:orderId', getAdminOrder)

  adminRoutes.get(
    '/orders/:orderId/payment-proof',
    makeAdminProofController(paymentProofStorage),
  )

  adminRoutes.patch('/orders/:orderId/status', updateAdminOrder)

  adminRoutes.patch('/orders/:orderId/payment', updateAdminPayment)

  adminRoutes.get('/products', listAdminProducts)

  adminRoutes.post(
    '/products',
    productUpload.array('images', 5),
    productImages.create,
  )

  adminRoutes.patch(
    '/products/:productId',
    productUpload.array('images', 5),
    productImages.update,
  )

  adminRoutes.patch('/products/:productId/stock', updateAdminStock)

  return adminRoutes
}