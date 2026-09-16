import type { Request, Response } from 'express'
import type { OrderRepository } from '../repositories/orderRepository'
import type { ProductRepository } from '../repositories/productRepository'

export function makeDevelopmentController(products: ProductRepository, orders: OrderRepository, persistenceMode: string, databaseConnected: boolean) {
  return async (_request: Request, response: Response) => {
    try {
      const [productCount, orderCount, recentProducts, recentOrders] = await Promise.all([products.getProductCount(), orders.getOrderCount(), products.getRecentProducts(10), orders.getRecentOrders(10)])
      return response.json({ success: true, environment: 'development', persistenceMode, databaseConnected, productCount, orderCount, recentProducts, recentOrders })
    } catch (error) {
      console.error('Development database verification failed', error)
      return response.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', message: 'Could not load database verification data.' })
    }
  }
}

export function makeDevelopmentOrdersController(orders: OrderRepository) {
  return async (_request: Request, response: Response) => {
    try { return response.json({ success: true, orders: await orders.getRecentOrders(10) }) } catch (error) { console.error('Development orders verification failed', error); return response.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', message: 'Could not load recent orders.' }) }
  }
}
