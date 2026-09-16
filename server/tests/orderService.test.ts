import { beforeEach, describe, expect, it } from 'vitest'
import { createOrderSchema, OrderService, resetOrderStoreForTests } from '../src/services/orderService'
import { InMemoryProductRepository, type ProductRepository } from '../src/repositories/productRepository'
import type { ServerProduct } from '../src/models/productModel'

const validCustomer = { fullName: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', address: '12 Market Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' }
const service = new OrderService(new InMemoryProductRepository())
const lowValueProducts: ServerProduct[] = [{ id: 'prod_low_value', name: 'Low Value Demo', sku: 'RS-LOW-001', price: 100, stock: 10, isActive: true, variants: [] }]
const lowValueService = new OrderService({ findByIds: async (ids) => lowValueProducts.filter((product) => ids.includes(product.id)), getCatalogProducts: async () => [], getProductCount: async () => 1, getRecentProducts: async () => [], getStockSnapshot: async () => ({}), reserveStock: async () => true, releaseStock: async () => undefined } satisfies ProductRepository)

beforeEach(() => resetOrderStoreForTests())

describe('secure order creation', () => {
  it('calculates current database prices and ignores client price and total', async () => {
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 2, price: 1, total: 2 }], customer: validCustomer, payment: { method: 'cod' }, paymentStatus: 'paid', orderStatus: 'delivered' })
    const order = await service.createOrder(input, 'price-tamper-test')
    expect(order.pricing.subtotal).toBe(1798)
    expect(order.pricing.total).toBe(1848)
    expect(order.payment.status).toBe('pending')
    expect(order.orderStatus).toBe('pending')
  })

  it('rejects a real subtotal below the minimum even when client total is raised', async () => {
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_low_value', quantity: 1, price: 1, total: 200 }], customer: validCustomer, payment: { method: 'cod' } })
    await expect(lowValueService.createOrder(input, 'minimum-test')).rejects.toMatchObject({ code: 'MINIMUM_ORDER_NOT_MET' })
  })

  it('rejects quantities beyond stock and malformed quantities', async () => {
    const overStock = createOrderSchema.parse({ items: [{ productId: 'prod_jute_tote', quantity: 8 }], customer: validCustomer, payment: { method: 'cod' } })
    await expect(service.createOrder(overStock, 'stock-test')).rejects.toMatchObject({ code: 'OUT_OF_STOCK' })
    expect(() => createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 0 }], customer: validCustomer })).toThrow()
    expect(() => createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: -1 }], customer: validCustomer })).toThrow()
  })

  it('rejects invalid customer data, empty cart, and malformed product IDs', () => {
    expect(() => createOrderSchema.parse({ items: [], customer: validCustomer })).toThrow()
    expect(() => createOrderSchema.parse({ items: [{ productId: 'wrong', quantity: 1 }], customer: validCustomer })).toThrow()
    expect(() => createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer: { ...validCustomer, phone: '123' } })).toThrow()
    expect(() => createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer: { ...validCustomer, pincode: '123' } })).toThrow()
  })

  it('returns the same order for a repeated idempotency key', async () => {
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer: validCustomer, payment: { method: 'cod' } })
    const first = await service.createOrder(input, 'duplicate-test')
    const second = await service.createOrder(input, 'duplicate-test')
    expect(second).toEqual(first)
  })
})
