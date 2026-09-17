import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { errorHandler } from './middleware/errorHandler'
import { createOrderRoutes } from './routes/createOrderRoutes'
import type { OrderRepository } from './repositories/orderRepository'
import type { ProductRepository } from './repositories/productRepository'
import { getPaymentConfig } from './controllers/paymentController'
import { createDevelopmentRoutes } from './routes/developmentRoutes'
import { env } from './config/env'
import { createAdminRoutes } from './routes/adminRoutes'
import {
  makeProductController,
  makeProductImageController,
} from './controllers/productController'
import { createProductImageStorage, type ProductImageStorage } from './services/productImageStorage'
import { LocalPrivatePaymentProofStorage } from './services/paymentProofStorage'

export function makeApp(
  products: ProductRepository,
  orders: OrderRepository,
  databaseConnected = false,
  persistenceMode = 'memory',
  productImageStorage?: ProductImageStorage,
) {
  const application = express()

  const paymentProofStorage = new LocalPrivatePaymentProofStorage()
  const imageStorage = productImageStorage ?? createProductImageStorage()

  application.disable('x-powered-by')

  application.use(helmet())

  application.use(cors({ origin: env.FRONTEND_URL }))

  application.use(express.json({ limit: '50kb' }))

  application.get('/api/health', (_request, response) =>
    response.json({ success: true, status: 'ok' }),
  )

  application.get('/api/payment-config', getPaymentConfig)

  application.get('/api/products', makeProductController(products))

  application.get(
    '/api/products/:productId/images/{*reference}',
    makeProductImageController(imageStorage),
  )

  application.use(
    '/api/admin',
    createAdminRoutes(paymentProofStorage, imageStorage),
  )

  application.use(
    '/api/dev',
    createDevelopmentRoutes(
      products,
      orders,
      persistenceMode,
      databaseConnected,
      env.NODE_ENV === 'development',
    ),
  )

  application.use(
    '/api/orders',
    createOrderRoutes(products, orders, paymentProofStorage),
  )

  application.use(errorHandler)

  return application
}