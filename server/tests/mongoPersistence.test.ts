import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ProductModel } from '../src/models/productDocument'
import { OrderModel } from '../src/models/orderDocument'
import { MongoOrderRepository } from '../src/repositories/mongoOrderRepository'
import { MongoProductRepository } from '../src/repositories/mongoProductRepository'
import { OrderService, createOrderSchema } from '../src/services/orderService'

let mongo: MongoMemoryServer
const customer = { fullName: 'Asha Rao', phone: '9876543210', address: '12 Market Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' }

let mongoUri = ''
beforeAll(async () => {
  try {
    mongoUri = 'mongodb://127.0.0.1:27017/raja-store-persistence-test'
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 })
  } catch {
    mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } })
    mongoUri = mongo.getUri()
    await mongoose.connect(mongoUri)
  }
}, 60000)
beforeEach(async () => { await ProductModel.deleteMany({}); await OrderModel.deleteMany({}); await ProductModel.create({ productId: 'prod_persistent', name: 'Persistent Demo', slug: 'persistent-demo', description: 'Demo', shortDescription: 'Demo', sku: 'RS-PER-001', category: { slug: 'home', name: 'Home' }, price: 500, stock: 1, active: true, variants: [] }) })
afterAll(async () => { await ProductModel.deleteMany({}); await OrderModel.deleteMany({}); await mongoose.disconnect(); if (mongo) await mongo.stop() })

describe('MongoDB persistence', () => {
  it('reads current price and stock, persists order, and retrieves it after reconnect', async () => {
    const products = new MongoProductRepository(); const orders = new MongoOrderRepository(); const service = new OrderService(products, orders)
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_persistent', quantity: 1, price: 1, total: 1 }], customer, payment: { method: 'cod' } })
    const created = await service.createOrder(input, 'mongo-persist-key')
    expect(created.pricing.subtotal).toBe(500)
    await mongoose.disconnect(); await mongoose.connect(mongoUri)
    const restored = await new MongoOrderRepository().findByOrderId(created.orderId)
    expect(restored?.orderId).toBe(created.orderId)
    expect(restored?.payment.status).toBe('pending')
  })

  it('prevents two concurrent orders from consuming one stock unit', async () => {
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_persistent', quantity: 1 }], customer, payment: { method: 'cod' } })
    const attempts = await Promise.allSettled([new OrderService(new MongoProductRepository(), new MongoOrderRepository()).createOrder(input, 'concurrent-a'), new OrderService(new MongoProductRepository(), new MongoOrderRepository()).createOrder(input, 'concurrent-b')])
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect((await ProductModel.findOne({ productId: 'prod_persistent' }))?.stock).toBe(0)
  })
})
