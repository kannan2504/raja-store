import express, { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'

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
import { createProductImageStorage, type ProductImageStorage } from '../services/productImageStorage'
import { createPaymentProofStorage, type PaymentProofStorage } from '../services/paymentProofStorage'

export function createAdminRoutes(
  paymentProofStorage: PaymentProofStorage = createPaymentProofStorage(),
  productImageStorage: ProductImageStorage = createProductImageStorage(),
) {
  const adminRoutes = Router()

  adminRoutes.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message: 'Too many failed admin attempts. Please try again later.' },
  }))

  adminRoutes.use(requireAdmin)

  const productUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 5,
    },
  })

  const bulkImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 10,
    },
  })

  const productImages = makeAdminProductController(productImageStorage)

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
  adminRoutes.delete('/products/:productId', productImages.deleteProduct)
  adminRoutes.post('/products/bulk-upload-image', bulkImageUpload.array('images', 10), productImages.bulkUploadImages)
  adminRoutes.post('/products/bulk-import', express.json({ limit: '2mb' }), productImages.bulkImport)

  return adminRoutes
}
