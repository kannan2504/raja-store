import { beforeEach, describe, expect, it } from 'vitest'
import { createOrderSchema, OrderService, resetOrderStoreForTests } from '../src/services/orderService'
import { InMemoryProductRepository } from '../src/repositories/productRepository'
import { validatePaymentProof } from '../src/services/imageValidation'

const customer = { fullName: 'Asha Rao', phone: '9876543210', address: '12 Market Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' }
const service = new OrderService(new InMemoryProductRepository())
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])

beforeEach(() => resetOrderStoreForTests())

describe('COD and manual UPI security', () => {
  it('creates COD with pending payment and does not require proof', async () => {
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer, payment: { method: 'cod' } })
    const order = await service.createOrder(input, 'cod-test')
    expect(order.payment).toMatchObject({ method: 'cod', status: 'pending', utrNumber: null, proofFileId: null })
    expect(order.orderStatus).toBe('pending')
  })

  it('requires UTR and proof reference for manual UPI', async () => {
    const missing = createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer, payment: { method: 'manual_upi' } })
    await expect(service.createOrder(missing, 'upi-missing')).rejects.toMatchObject({ code: 'PAYMENT_PROOF_REQUIRED' })
    const valid = createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer, payment: { method: 'manual_upi', utrNumber: 'UTR123456', proofFileId: '7b2c8b4c-28b2-4ba8-a4be-9a2a9b4c1e77' } })
    const order = await service.createOrder(valid, 'upi-valid')
    expect(order.payment).toMatchObject({ method: 'manual_upi', status: 'pending_verification', utrNumber: 'UTR123456' })
  })

  it('rejects unsupported payment methods and ignores protected status fields', () => {
    expect(() => createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer, payment: { method: 'razorpay' }, verified: true, orderStatus: 'delivered' })).toThrow()
  })

  it('validates image signatures, type, size, and safe extension', () => {
    expect(validatePaymentProof({ originalname: '../../proof.png', mimetype: 'image/png', size: png.length, buffer: png })).toBe('png')
    expect(() => validatePaymentProof({ originalname: 'proof.png', mimetype: 'image/png', size: 5 * 1024 * 1024 + 1, buffer: png })).toThrow()
    expect(() => validatePaymentProof({ originalname: 'proof.exe', mimetype: 'application/octet-stream', size: png.length, buffer: png })).toThrow()
    expect(() => validatePaymentProof({ originalname: 'proof.png', mimetype: 'image/png', size: png.length, buffer: Buffer.from('not an image') })).toThrow()
  })

  it('tracks with order ID and matching phone but returns no proof reference', async () => {
    const input = createOrderSchema.parse({ items: [{ productId: 'prod_brass_dabba', quantity: 1 }], customer, payment: { method: 'cod' } })
    const order = await service.createOrder(input, 'track-test')
    await expect(service.trackOrder(order.orderId, customer.phone)).resolves.toMatchObject({ orderId: order.orderId, payment: { method: 'cod', status: 'pending' } })
    await expect(service.trackOrder(order.orderId, '9123456789')).rejects.toMatchObject({ code: 'ORDER_VERIFICATION_FAILED' })
    const tracked = await service.trackOrder(order.orderId, customer.phone)
    expect(JSON.stringify(tracked)).not.toContain('proofFileId')
    expect(JSON.stringify(tracked)).not.toContain('trackingTokenHash')
  })
})
