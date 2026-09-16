import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevelopmentRoutes } from '../src/routes/developmentRoutes'
import type { OrderRepository } from '../src/repositories/orderRepository'
import type { ProductRepository } from '../src/repositories/productRepository'

const products = { findByIds: async () => [], getCatalogProducts: async () => [], getStockSnapshot: async () => ({}), reserveStock: async () => true, releaseStock: async () => undefined, getProductCount: async () => 10, getRecentProducts: async () => [{ productId: 'prod_demo', name: 'Demo', sku: 'SKU-1', price: 500, stock: 2 }] } as ProductRepository
const orders = { findByIdempotencyKey: async () => undefined, findByOrderId: async () => undefined, create: async (order: never) => order, nextOrderId: async () => 'ORD-2026-000001', claimOrderCreatedNotification: async () => true, getOrderCount: async () => 3, getRecentOrders: async () => [{ orderId: 'ORD-2026-000001', customerName: 'Test Customer', maskedPhone: '98765*****', total: 850, paymentMethod: 'cod', paymentStatus: 'pending', orderStatus: 'pending', createdAt: '2026-09-14T16:32:00.000Z' }] } as OrderRepository

async function request(enabled: boolean, path: string) {
  const app = express(); app.use('/api/dev', createDevelopmentRoutes(products, orders, 'mongo', true, enabled))
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  const address = server.address() as { port: number }
  try { return await fetch(`http://127.0.0.1:${address.port}/api/dev${path}`) } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
}

afterEach(() => undefined)

describe('development database verification endpoints', () => {
  it('returns safe status and recent orders in development', async () => {
    const response = await request(true, '/database-status'); const body = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200); expect(body.productCount).toBe(10); expect(body.orderCount).toBe(3); expect(JSON.stringify(body)).not.toContain('DATABASE_URL'); expect(JSON.stringify(body)).not.toContain('trackingTokenHash'); expect(JSON.stringify(body)).not.toContain('proofFileId')
    const ordersResponse = await request(true, '/orders'); expect((await ordersResponse.json() as { orders: Array<{ maskedPhone: string }> }).orders[0].maskedPhone).toBe('98765*****')
  })

  it('rejects the development endpoints when disabled for production', async () => {
    const response = await request(false, '/database-status'); expect(response.status).toBe(404)
  })
})
