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
    // subtotal 1798 >= 300 → free delivery
    expect(order.pricing.deliveryCharge).toBe(0)
    expect(order.pricing.total).toBe(1798)
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

/* --------------------------------------------------------------------------
   Delivery charge business rules
   - subtotal < 200  → rejected (MINIMUM_ORDER_NOT_MET)
   - subtotal 200    → delivery = 50, total = 250
   - subtotal 299    → delivery = 50, total = 349
   - subtotal 300    → delivery = 0,  total = 300
   - subtotal > 300  → delivery = 0,  total = subtotal
   All values are computed server-side; no delivery charge is trusted from
   the client.
   -------------------------------------------------------------------------- */
function makeRepo(price: number, stock = 99): ProductRepository {
  const products: ServerProduct[] = [{ id: 'prod_test', name: 'Test Product', sku: 'TS-001', price, stock, isActive: true, variants: [] }]
  return {
    findByIds: async (ids) => products.filter((p) => ids.includes(p.id)),
    getCatalogProducts: async () => [],
    getProductCount: async () => products.length,
    getRecentProducts: async () => [],
    getStockSnapshot: async () => ({}),
    reserveStock: async () => true,
    releaseStock: async () => undefined,
  } satisfies ProductRepository
}

describe('delivery charge calculation', () => {
  it('rejects subtotal below ₹200 (minimum order not met)', async () => {
    // price=100, qty=1 → subtotal=100 < 200
    const svc = new OrderService(makeRepo(100))
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_test', quantity: 1 }], customer: validCustomer, payment: { method: 'cod' } })
    await expect(svc.createOrder(input, 'delivery-test-below-min')).rejects.toMatchObject({ code: 'MINIMUM_ORDER_NOT_MET' })
  })

  it('charges ₹50 delivery when subtotal is exactly ₹200', async () => {
    // price=200, qty=1 → subtotal=200
    const svc = new OrderService(makeRepo(200))
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_test', quantity: 1 }], customer: validCustomer, payment: { method: 'cod' } })
    const order = await svc.createOrder(input, 'delivery-test-200')
    expect(order.pricing.subtotal).toBe(200)
    expect(order.pricing.deliveryCharge).toBe(50)
    expect(order.pricing.total).toBe(250)
  })

  it('charges ₹50 delivery when subtotal is ₹299', async () => {
    // price=299, qty=1 → subtotal=299
    const svc = new OrderService(makeRepo(299))
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_test', quantity: 1 }], customer: validCustomer, payment: { method: 'cod' } })
    const order = await svc.createOrder(input, 'delivery-test-299')
    expect(order.pricing.subtotal).toBe(299)
    expect(order.pricing.deliveryCharge).toBe(50)
    expect(order.pricing.total).toBe(349)
  })

  it('gives FREE delivery when subtotal is exactly ₹300', async () => {
    // price=300, qty=1 → subtotal=300
    const svc = new OrderService(makeRepo(300))
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_test', quantity: 1 }], customer: validCustomer, payment: { method: 'cod' } })
    const order = await svc.createOrder(input, 'delivery-test-300')
    expect(order.pricing.subtotal).toBe(300)
    expect(order.pricing.deliveryCharge).toBe(0)
    expect(order.pricing.total).toBe(300)
  })

  it('gives FREE delivery when subtotal is above ₹300', async () => {
    // price=500, qty=1 → subtotal=500
    const svc = new OrderService(makeRepo(500))
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_test', quantity: 1 }], customer: validCustomer, payment: { method: 'cod' } })
    const order = await svc.createOrder(input, 'delivery-test-above-300')
    expect(order.pricing.subtotal).toBe(500)
    expect(order.pricing.deliveryCharge).toBe(0)
    expect(order.pricing.total).toBe(500)
  })
})

