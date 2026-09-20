import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { makeApp } from '../src/appFactory'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { InMemoryProductRepository } from '../src/repositories/productRepository'

const sampleCustomer = {
  fullName: 'Priya Sharma',
  phone: '9876543210',
  email: 'priya@example.com',
  address: 'Flat 4B, Shanti Nilayam, 12 Temple Street, Mylapore',
  city: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600004',
  notes: 'Ring the bell twice',
}

describe('SEC-03: customer order-tracking privacy and enumeration protection', () => {
  async function setupTestApp() {
    const products = new InMemoryProductRepository()
    const orders = new InMemoryOrderRepository()
    const app = makeApp(products, orders, false, 'memory')

    // Create an order via API
    const createRes = await supertest(app)
      .post('/api/orders')
      .send({
        items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
        customer: sampleCustomer,
        payment: { method: 'cod' },
      })

    expect(createRes.status).toBe(201)
    const orderId = createRes.body.order.orderId as string
    return { app, orderId }
  }

  it('masks the raw street address and returns Address protected in tracking response', async () => {
    const { app, orderId } = await setupTestApp()

    const res = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId, phone: sampleCustomer.phone })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Raw street address must NEVER be returned
    expect(res.body.order.shippingAddress.address).toBe('Address protected')
    expect(JSON.stringify(res.body)).not.toContain(sampleCustomer.address)
    expect(JSON.stringify(res.body)).not.toContain('Shanti Nilayam')
    expect(JSON.stringify(res.body)).not.toContain('Mylapore')

    // City, state, pincode remain intact
    expect(res.body.order.shippingAddress.city).toBe(sampleCustomer.city)
    expect(res.body.order.shippingAddress.state).toBe(sampleCustomer.state)
    expect(res.body.order.shippingAddress.pincode).toBe(sampleCustomer.pincode)
  })

  it('suppresses customer PII, delivery notes, and internal hashes from tracking response', async () => {
    const { app, orderId } = await setupTestApp()

    const res = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId, phone: sampleCustomer.phone })

    expect(res.status).toBe(200)
    const jsonStr = JSON.stringify(res.body)

    // Name, phone, email, notes must not be present
    expect(jsonStr).not.toContain(sampleCustomer.fullName)
    expect(jsonStr).not.toContain(sampleCustomer.email)
    expect(jsonStr).not.toContain(sampleCustomer.notes)
    expect(res.body.order.customer).toBeUndefined()

    // Internal secrets and proofs must not be present
    expect(jsonStr).not.toContain('trackingTokenHash')
    expect(jsonStr).not.toContain('proofFileId')
    expect(jsonStr).not.toContain('utrNumber')
  })

  it('limits tracking attempts to 5 per 15 minutes for the same phone number', async () => {
    const { app, orderId } = await setupTestApp()

    // First 5 attempts should succeed (or fail verification normally, but not be rate limited)
    for (let i = 1; i <= 5; i++) {
      const res = await supertest(app)
        .post('/api/orders/track')
        .send({ orderId, phone: sampleCustomer.phone })
      expect(res.status).toBe(200)
    }

    // 6th attempt with same phone must be rate-limited
    const sixthRes = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId, phone: sampleCustomer.phone })

    expect(sixthRes.status).toBe(429)
    expect(sixthRes.body).toEqual({
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many tracking attempts. Please try again later.',
    })
  })

  it('rate limits malformed/missing phone requests so attackers cannot bypass limits', async () => {
    const { app } = await setupTestApp()

    // Requests with invalid/missing phone fall back to IP rate limiting
    for (let i = 1; i <= 5; i++) {
      const res = await supertest(app)
        .post('/api/orders/track')
        .send({ orderId: 'ORD-2026-000001', phone: 'invalid-phone' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('ORDER_VERIFICATION_FAILED')
    }

    // 6th attempt from the same client without a valid phone is rate-limited
    const sixthRes = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId: 'ORD-2026-000001', phone: 'invalid-phone' })

    expect(sixthRes.status).toBe(429)
    expect(sixthRes.body.code).toBe('RATE_LIMITED')
  })

  it('returns identical generic ORDER_VERIFICATION_FAILED for wrong phone and nonexistent order', async () => {
    const { app, orderId } = await setupTestApp()

    // Case 1: Existing order, incorrect phone
    const wrongPhoneRes = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId, phone: '9123456789' })

    expect(wrongPhoneRes.status).toBe(400)
    expect(wrongPhoneRes.body).toEqual({
      success: false,
      code: 'ORDER_VERIFICATION_FAILED',
      message: 'Unable to verify the order details.',
    })

    // Case 2: Nonexistent order ID, valid phone format
    const nonexistentRes = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId: 'ORD-2026-999999', phone: sampleCustomer.phone })

    expect(nonexistentRes.status).toBe(400)
    expect(nonexistentRes.body).toEqual({
      success: false,
      code: 'ORDER_VERIFICATION_FAILED',
      message: 'Unable to verify the order details.',
    })

    // Case 3: Invalid regex format
    const badFormatRes = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId: 'BAD-ID', phone: '123' })

    expect(badFormatRes.status).toBe(400)
    expect(badFormatRes.body).toEqual({
      success: false,
      code: 'ORDER_VERIFICATION_FAILED',
      message: 'Unable to verify the order details.',
    })
  })

  it('preserves order creation and tracking contract compatibility', async () => {
    const { app, orderId } = await setupTestApp()

    const res = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId, phone: sampleCustomer.phone })

    expect(res.status).toBe(200)
    const order = res.body.order

    // Verify all fields expected by frontend TrackedOrder interface exist
    expect(order).toHaveProperty('orderId', orderId)
    expect(order).toHaveProperty('status')
    expect(order).toHaveProperty('payment')
    expect(order.payment).toHaveProperty('method', 'cod')
    expect(order.payment).toHaveProperty('status')
    expect(order).toHaveProperty('items')
    expect(Array.isArray(order.items)).toBe(true)
    expect(order).toHaveProperty('subtotal')
    expect(order).toHaveProperty('deliveryCharge')
    expect(order).toHaveProperty('total')
    expect(order).toHaveProperty('shippingAddress')
    expect(order.shippingAddress).toHaveProperty('address', 'Address protected')
    expect(order.shippingAddress).toHaveProperty('city')
    expect(order.shippingAddress).toHaveProperty('state')
    expect(order.shippingAddress).toHaveProperty('pincode')
  })
})
