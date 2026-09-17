import { describe, expect, it, vi } from 'vitest'
import supertest from 'supertest'
import { v2 as cloudinary } from 'cloudinary'
import {
  CloudinaryPrivatePaymentProofStorage,
  createPaymentProofStorage,
  LocalPrivatePaymentProofStorage,
} from '../src/services/paymentProofStorage'
import { makeApp } from '../src/appFactory'
import { InMemoryProductRepository } from '../src/repositories/productRepository'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { OrderModel } from '../src/models/orderDocument'
import { env } from '../src/config/env'
import { validatePaymentProof } from '../src/services/imageValidation'
import { GmailSmtpEmailProvider } from '../src/services/orderNotification'

const validPngBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])

describe('Private Cloudinary Payment Proof Storage', () => {
  const mockPublicId = 'raja-store/payment-proofs/sample-proof-12345'
  const proofStorage = new CloudinaryPrivatePaymentProofStorage({
    cloudName: 'test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
  })

  // Prevent real SMTP calls in tests
  vi.spyOn(GmailSmtpEmailProvider.prototype, 'send').mockResolvedValue(undefined)

  const app = makeApp(
    new InMemoryProductRepository(),
    new InMemoryOrderRepository(),
    false,
    'memory',
    undefined,
    proofStorage,
  )

  let createdOrderId = ''

  it('1. proof upload uses private/authenticated Cloudinary storage and returns stable reference', async () => {
    const mockUploadStream = vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
      (options: any, callback?: any) => {
        expect(options.type).toBe('authenticated')
        expect(options.resource_type).toBe('image')
        expect(options.folder).toBe('raja-store/payment-proofs')

        const streamMock = {
          end: (_buf: Buffer) => {
            if (callback) {
              callback(null, {
                public_id: mockPublicId,
                secure_url: `https://res.cloudinary.com/test-cloud/image/authenticated/s--fake--/v1/${mockPublicId}`,
              })
            }
          },
        }
        return streamMock as any
      },
    )

    const stored = await proofStorage.upload({
      buffer: validPngBuffer,
      extension: 'png',
    })

    expect(mockUploadStream).toHaveBeenCalled()
    expect(stored.proofFileId).toBe(`cloudinary:${mockPublicId}`)
    expect(stored.extension).toBe('png')
  })

  it('2. stable reference is persisted with the order and no public URL is exposed during checkout', async () => {
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
      (options: any, callback?: any) => {
        expect(options.type).toBe('authenticated')
        const streamMock = {
          end: (_buf: Buffer) => {
            if (callback) {
              callback(null, {
                public_id: mockPublicId,
                secure_url: `https://res.cloudinary.com/test-cloud/image/authenticated/s--fake--/v1/${mockPublicId}`,
              })
            }
          },
        }
        return streamMock as any
      },
    )

    const response = await supertest(app)
      .post('/api/orders')
      .field('items', JSON.stringify([{ productId: 'prod_brass_dabba', quantity: 1 }]))
      .field('customer', JSON.stringify({
        fullName: 'Test Customer',
        phone: '9876543210',
        address: '12 Temple Street',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      }))
      .field('paymentMethod', 'manual_upi')
      .field('utrNumber', 'UTR-9876543210')
      .attach('paymentProof', validPngBuffer, 'proof.png')

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    createdOrderId = response.body.order.orderId
    expect(createdOrderId).toBeDefined()

    // Customer order response must NOT expose proofFileId or Cloudinary URL
    expect(response.body.order.proofFileId).toBeUndefined()
    expect(JSON.stringify(response.body)).not.toContain('cloudinary')
  })

  it('3. tracking order as customer does not expose payment proof reference or URL', async () => {
    const trackResponse = await supertest(app)
      .post('/api/orders/track')
      .send({ orderId: createdOrderId, phone: '9876543210' })

    expect(trackResponse.status).toBe(200)
    expect(trackResponse.body.success).toBe(true)
    expect(JSON.stringify(trackResponse.body)).not.toContain('proofFileId')
    expect(JSON.stringify(trackResponse.body)).not.toContain('cloudinary')
  })

  it('4. unauthenticated users cannot retrieve payment proofs', async () => {
    // No auth header
    const noAuth = await supertest(app).get(`/api/admin/orders/${createdOrderId}/payment-proof`)
    expect(noAuth.status).toBe(401)

    // Wrong auth header
    const badAuth = await supertest(app)
      .get(`/api/admin/orders/${createdOrderId}/payment-proof`)
      .set('Authorization', 'Bearer invalid-token')
    expect(badAuth.status).toBe(401)
  })

  it('5. authenticated admin can retrieve/view proof via server stream without exposing credentials', async () => {
    const fakeSignedUrl = 'https://res.cloudinary.com/test-cloud/image/authenticated/s--signed--/v1/mock-proof'
    const mockCloudinaryUrl = vi.spyOn(cloudinary, 'url').mockReturnValue(fakeSignedUrl)

    // Mock OrderModel.findOne to return order with the Cloudinary proof reference
    vi.spyOn(OrderModel, 'findOne').mockReturnValue({
      lean: async () => ({
        orderId: createdOrderId,
        payment: {
          method: 'manual_upi',
          proofFileId: `cloudinary:${mockPublicId}`,
        },
      }),
    } as any)

    // Mock global fetch to return the image stream
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => new Uint8Array(validPngBuffer).buffer,
    }) as any

    try {
      const response = await supertest(app)
        .get(`/api/admin/orders/${createdOrderId}/payment-proof`)
        .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
        .buffer(true)
        .parse((res, callback) => {
          const data: Buffer[] = []
          res.on('data', (chunk) => data.push(chunk))
          res.on('end', () => callback(null, Buffer.concat(data)))
        })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('image/png')
      expect(Buffer.compare(response.body, validPngBuffer)).toBe(0)

      // Verified signed URL was generated for authenticated asset
      expect(mockCloudinaryUrl).toHaveBeenCalledWith(
        mockPublicId,
        expect.objectContaining({ type: 'authenticated', sign_url: true, secure: true }),
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('6. legacy local proof compatibility remains intact without crashing', async () => {
    // Legacy local storage get with non-existent UUID gives clean 404
    const legacyStorage = new LocalPrivatePaymentProofStorage()
    await expect(legacyStorage.get('00000000-0000-0000-0000-000000000000')).rejects.toThrow()

    // Cloudinary storage delegating to non-existent legacy UUID gives clean 404
    await expect(proofStorage.get('00000000-0000-0000-0000-000000000000')).rejects.toThrow()

    // Deleting non-existent legacy UUID does not throw
    await expect(proofStorage.delete('00000000-0000-0000-0000-000000000000')).resolves.not.toThrow()
  })

  it('7. validation remains strictly enforced on payment proof uploads', () => {
    // Magic bytes and MIME validation
    expect(validatePaymentProof({
      originalname: 'proof.png',
      mimetype: 'image/png',
      size: validPngBuffer.length,
      buffer: validPngBuffer,
    })).toBe('png')

    // Unsupported extension
    expect(() => validatePaymentProof({
      originalname: 'proof.exe',
      mimetype: 'application/octet-stream',
      size: validPngBuffer.length,
      buffer: validPngBuffer,
    })).toThrowError(/must be a JPG, JPEG, PNG, or WEBP/)

    // Mismatched MIME
    expect(() => validatePaymentProof({
      originalname: 'proof.png',
      mimetype: 'text/plain',
      size: validPngBuffer.length,
      buffer: validPngBuffer,
    })).toThrowError(/file type is invalid/)

    // Corrupted magic bytes
    expect(() => validatePaymentProof({
      originalname: 'proof.png',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from('not an image'),
    })).toThrowError(/image data is invalid/)
  })

  it('8. fallback storage factory functions properly when credentials are absent', () => {
    const fallback = createPaymentProofStorage({
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    })
    expect(fallback).toBeInstanceOf(LocalPrivatePaymentProofStorage)
  })

  it('9. public product image functionality remains intact and unchanged', async () => {
    const response = await supertest(app)
      .get('/api/products/prod_brass_dabba/images/00000000-0000-0000-0000-000000000000.png')

    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })
})
