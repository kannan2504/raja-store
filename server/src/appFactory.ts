import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'

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
import { createPaymentProofStorage, type PaymentProofStorage } from './services/paymentProofStorage'
import { isDatabaseConnected } from './config/database'
import { HttpError } from './utils/httpError'

export function makeApp(
  products: ProductRepository,
  orders: OrderRepository,
  databaseConnected = false,
  persistenceMode = 'memory',
  productImageStorage?: ProductImageStorage,
  paymentProofStorage?: PaymentProofStorage,
) {
  const application = express()

  const proofStorage = paymentProofStorage ?? createPaymentProofStorage()
  const imageStorage = productImageStorage ?? createProductImageStorage()
  const allowedOrigins = new Set(
    [env.FRONTEND_URL, ...env.ADDITIONAL_FRONTEND_URLS].map((origin) => new URL(origin).origin),
  )
  const isAllowedOrigin = (origin: string) => {
    if (allowedOrigins.has(origin)) return true
    try {
      const url = new URL(origin)
      return url.protocol === 'https:' && url.hostname.endsWith('.chatgpt.site')
    } catch {
      return false
    }
  }

  application.disable('x-powered-by')
  application.set('trust proxy', 1)

  application.use(helmet())

  application.use((request, response, next) => {
    const requestId = randomUUID()
    response.locals.requestId = requestId
    response.setHeader('X-Request-Id', requestId)
    next()
  })

  application.use(cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true)
      return callback(new HttpError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed.'))
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400,
  }))

  application.use(express.json({ limit: '50kb' }))

  application.get('/api/health', (_request, response) => {
    const ready = persistenceMode !== 'mongo' || isDatabaseConnected()
    return response.status(ready ? 200 : 503).json({ success: ready, status: ready ? 'ok' : 'unavailable' })
  })

  application.get('/api/payment-config', getPaymentConfig)

  application.get('/api/products', makeProductController(products))

  application.get(
    '/api/products/:productId/images/{*reference}',
    makeProductImageController(imageStorage),
  )

  application.use(
    '/api/admin',
    createAdminRoutes(proofStorage, imageStorage),
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
    createOrderRoutes(products, orders, proofStorage),
  )

  application.use((_request, response) =>
    response.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Not found.' }),
  )

  application.use(errorHandler)

  return application
}
