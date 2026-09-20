import { Router } from 'express'
import { makeDevelopmentController, makeDevelopmentOrdersController } from '../controllers/developmentController'
import type { OrderRepository } from '../repositories/orderRepository'
import type { ProductRepository } from '../repositories/productRepository'
import { env } from '../config/env'

export function createDevelopmentRoutes(products: ProductRepository, orders: OrderRepository, persistenceMode: string, databaseConnected: boolean, enabled: boolean) {
  const router = Router()
  if (!enabled || env.NODE_ENV === 'production') {
    router.use((_request, response) => response.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Not found.' }))
    return router
  }
  router.get('/database-status', makeDevelopmentController(products, orders, persistenceMode, databaseConnected))
  router.get('/orders', makeDevelopmentOrdersController(orders))
  return router
}
