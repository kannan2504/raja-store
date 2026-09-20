import { describe, expect, it, vi } from 'vitest'
import supertest from 'supertest'
import { makeApp } from '../src/appFactory'
import { InMemoryProductRepository } from '../src/repositories/productRepository'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { CloudinaryPrivatePaymentProofStorage, type PaymentProofStorage } from '../src/services/paymentProofStorage'
import { GmailSmtpEmailProvider } from '../src/services/orderNotification'
import { v2 as cloudinary } from 'cloudinary'

const validPngBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])

const sampleCustomer = {
  fullName: 'Kavitha Raman',
  phone: '9876543210',
  email: 'kavitha@example.com',
  address: '10 Gandhi Road, T. Nagar',
  city: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600017',
}

describe('SEC-04: Payment proof upload enforcement and storage injection protection', () => {
  // Suppress SMTP external calls in tests
  vi.spyOn(GmailSmtpEmailProvider.prototype, 'send').mockResolvedValue(undefined)

  function createTestContext(customStorage?: PaymentProofStorage) {
    const products = new InMemoryProductRepository()
    const orders = new InMemoryOrderRepository()
    const app = makeApp(products, orders, false, 'memory', undefined, customStorage)
    return { app, products, orders }
  }

  it('1. rejects direct JSON manual_upi requests attempting to inject proofFileId', async () => {
    const { app, orders } = createTestContext()

    const res = await supertest(app)
      .post('/api/orders')
      .send({
        items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
        customer: sampleCustomer,
        payment: {
          method: 'manual_upi',
          utrNumber: 'UTR-1234567890',
          proofFileId: 'injected-fake-proof-id',
        },
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PAYMENT_PROOF_REQUIRED')
    expect(res.body.message).toContain('payment screenshot')

    // Verify order was NEVER created and no stock locked
    const count = await orders.getOrderCount()
    expect(count).toBe(0)
  })

  it('2. rejects direct JSON manual_upi requests without an uploaded proof file', async () => {
    const { app, orders } = createTestContext()

    const res = await supertest(app)
      .post('/api/orders')
      .send({
        items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
        customer: sampleCustomer,
        payment: {
          method: 'manual_upi',
          utrNumber: 'UTR-1234567890',
        },
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PAYMENT_PROOF_REQUIRED')
    const count = await orders.getOrderCount()
    expect(count).toBe(0)
  })

  it('3. rejects multipart manual_upi requests missing the paymentProof file', async () => {
    const { app, orders } = createTestContext()

    const res = await supertest(app)
      .post('/api/orders')
      .field('items', JSON.stringify([{ productId: 'prod_brass_dabba', quantity: 1 }]))
      .field('customer', JSON.stringify(sampleCustomer))
      .field('paymentMethod', 'manual_upi')
      .field('utrNumber', 'UTR-1234567890')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PAYMENT_PROOF_REQUIRED')
    const count = await orders.getOrderCount()
    expect(count).toBe(0)
  })

  it('4. validates file signatures on paymentProof upload and rejects invalid files', async () => {
    const { app, orders } = createTestContext()

    const invalidBuffer = Buffer.from('this is not an image but fake text file')
    const res = await supertest(app)
      .post('/api/orders')
      .field('items', JSON.stringify([{ productId: 'prod_brass_dabba', quantity: 1 }]))
      .field('customer', JSON.stringify(sampleCustomer))
      .field('paymentMethod', 'manual_upi')
      .field('utrNumber', 'UTR-1234567890')
      .attach('paymentProof', invalidBuffer, 'proof.png')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_PAYMENT_PROOF')
    const count = await orders.getOrderCount()
    expect(count).toBe(0)
  })

  it('5. sets proofFileId only from server-side storage upload result for valid manual_upi', async () => {
    let uploadedFileId = ''
    const mockStorage: PaymentProofStorage = {
      upload: vi.fn().mockImplementation(async () => {
        uploadedFileId = 'server-generated-proof-999'
        return { proofFileId: uploadedFileId, extension: 'png' }
      }),
      get: vi.fn(),
      delete: vi.fn(),
    }

    const { app, orders } = createTestContext(mockStorage)

    const res = await supertest(app)
      .post('/api/orders')
      .field('items', JSON.stringify([{ productId: 'prod_brass_dabba', quantity: 1 }]))
      .field('customer', JSON.stringify(sampleCustomer))
      .field('paymentMethod', 'manual_upi')
      .field('utrNumber', 'UTR-9876543210')
      .attach('paymentProof', validPngBuffer, 'proof.png')

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(mockStorage.upload).toHaveBeenCalledTimes(1)

    // Verify stored order in repository has the server-generated proof ID
    const storedOrder = await orders.findByOrderId(res.body.order.orderId)
    expect(storedOrder).toBeDefined()
    expect(storedOrder?.payment.proofFileId).toBe('server-generated-proof-999')
    expect(storedOrder?.payment.method).toBe('manual_upi')
    expect(storedOrder?.payment.status).toBe('pending_verification')
  })

  it('6. COD orders never persist client-injected proofFileId and ignore attached files', async () => {
    const mockStorage: PaymentProofStorage = {
      upload: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    }

    const { app, orders } = createTestContext(mockStorage)

    // JSON COD with injected proofFileId
    const jsonRes = await supertest(app)
      .post('/api/orders')
      .send({
        items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
        customer: sampleCustomer,
        payment: {
          method: 'cod',
          proofFileId: 'malicious-cod-proof-id',
        },
      })

    expect(jsonRes.status).toBe(201)
    const jsonOrder = await orders.findByOrderId(jsonRes.body.order.orderId)
    expect(jsonOrder?.payment.proofFileId).toBeNull()
    expect(mockStorage.upload).not.toHaveBeenCalled()

    // Multipart COD with attached file
    const multipartRes = await supertest(app)
      .post('/api/orders')
      .field('items', JSON.stringify([{ productId: 'prod_brass_dabba', quantity: 1 }]))
      .field('customer', JSON.stringify(sampleCustomer))
      .field('paymentMethod', 'cod')
      .attach('paymentProof', validPngBuffer, 'unnecessary.png')

    expect(multipartRes.status).toBe(201)
    const multipartOrder = await orders.findByOrderId(multipartRes.body.order.orderId)
    expect(multipartOrder?.payment.proofFileId).toBeNull()
    expect(mockStorage.upload).not.toHaveBeenCalled()
  })

  it('7. deletes uploaded proof if order creation subsequently fails (cleanup behavior)', async () => {
    const mockStorage: PaymentProofStorage = {
      upload: vi.fn().mockResolvedValue({ proofFileId: 'temp-proof-to-delete', extension: 'png' }),
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    const { app } = createTestContext(mockStorage)

    // Create order with invalid customer details (e.g. invalid phone) so Zod validation fails after upload
    const res = await supertest(app)
      .post('/api/orders')
      .field('items', JSON.stringify([{ productId: 'prod_brass_dabba', quantity: 1 }]))
      .field('customer', JSON.stringify({ ...sampleCustomer, phone: '123' })) // invalid Indian phone
      .field('paymentMethod', 'manual_upi')
      .field('utrNumber', 'UTR-9876543210')
      .attach('paymentProof', validPngBuffer, 'proof.png')

    expect(res.status).toBe(400)
    expect(mockStorage.upload).toHaveBeenCalledTimes(1)
    // Proof must be deleted since the order creation failed
    expect(mockStorage.delete).toHaveBeenCalledWith('temp-proof-to-delete')
  })

  it('8. restricts Cloudinary payment-proof access strictly to the raja-store/payment-proofs/ namespace', async () => {
    const cloudinaryStorage = new CloudinaryPrivatePaymentProofStorage({
      cloudName: 'test-cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    })

    // Out of namespace -> rejected with 404
    await expect(cloudinaryStorage.get('cloudinary:sensitive-folder/tax-invoice')).rejects.toThrow(
      'Payment proof not found.',
    )

    await expect(cloudinaryStorage.get('cloudinary:root-image')).rejects.toThrow(
      'Payment proof not found.',
    )

    // Out of namespace deletion is a no-op that does NOT call destroy
    const destroySpy = vi.spyOn(cloudinary.uploader, 'destroy')
    await cloudinaryStorage.delete('cloudinary:other-folder/not-a-proof')
    expect(destroySpy).not.toHaveBeenCalled()

    // Valid namespace gets signed
    const mockCloudinaryUrl = vi.spyOn(cloudinary, 'url').mockReturnValue('https://signed-url.example/proof')
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => new Uint8Array(validPngBuffer).buffer,
    }) as any

    try {
      const result = await cloudinaryStorage.get('cloudinary:raja-store/payment-proofs/valid-proof-123')
      expect(result).toBeDefined()
      expect(result.contentType).toBe('image/png')
      expect(mockCloudinaryUrl).toHaveBeenCalledWith(
        'raja-store/payment-proofs/valid-proof-123',
        expect.objectContaining({ type: 'authenticated', sign_url: true, secure: true }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
