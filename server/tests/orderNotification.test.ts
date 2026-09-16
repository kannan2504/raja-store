import { describe, expect, it } from 'vitest'
import { AdminOrderNotificationService, OrderNotificationFormatter } from '../src/services/orderNotification'
import type { Order } from '../src/models/orderModel'
import type { ProductRepository } from '../src/repositories/productRepository'

const order: Order = { orderId: 'ORD-2026-000099', idempotencyKey: 'notification-test', trackingTokenHash: 'private', customer: { fullName: 'Test Customer', phone: '9876543210', email: 'test@example.com', address: '12 Market Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' }, items: [{ productId: 'prod_test', productNameSnapshot: 'Test Product', skuSnapshot: 'SKU-TEST', quantity: 2, unitPrice: 500, lineTotal: 1000 }], pricing: { subtotal: 1000, deliveryCharge: 50, discount: 0, total: 1050 }, payment: { method: 'cod', status: 'pending', utrNumber: null, proofFileId: null, verifiedAt: null, verifiedBy: null }, orderStatus: 'pending', createdAt: '2026-09-15T12:00:00.000Z', updatedAt: '2026-09-15T12:00:00.000Z' }
const products = { findByIds: async () => [], getCatalogProducts: async () => [], getStockSnapshot: async () => ({ 'prod_test:default': 8 }), getProductCount: async () => 0, getRecentProducts: async () => [], reserveStock: async () => true, releaseStock: async () => undefined } as ProductRepository

describe('owner order notifications', () => {
  it('formats complete totals, items, payment, and remaining stock', async () => {
    const message = await new OrderNotificationFormatter(products).format(order)
    expect(message).toContain('ORD-2026-000099')
    expect(message).toContain('Test Product')
    expect(message).toContain('Qty: 2')
    expect(message).toContain('Subtotal: ₹1000')
    expect(message).toContain('TOTAL: ₹1050')
    expect(message).toContain('Remaining stock: 8')
  })

  it('claims ORDER_CREATED only once', async () => {
    let claims = 0
    const service = new AdminOrderNotificationService(new OrderNotificationFormatter(products), { send: async () => undefined }, { send: async () => undefined })
    const claim = async () => { claims += 1; return claims === 1 }
    await service.notifyOrderCreated(order, claim)
    await service.notifyOrderCreated(order, claim)
    expect(claims).toBe(2)
  })
})
