import supertest from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { makeApp } from '../src/appFactory'
import { env, validateEnvironment } from '../src/config/env'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { InMemoryProductRepository } from '../src/repositories/productRepository'
import { MongoOrderRepository } from '../src/repositories/mongoOrderRepository'
import { MongoProductRepository } from '../src/repositories/mongoProductRepository'
import type { OrderRepository } from '../src/repositories/orderRepository'
import type { ProductRepository } from '../src/repositories/productRepository'
import {
  CloudinaryProductImageStorage,
  isValidProductImageReference,
  serializeProductImage,
} from '../src/services/productImageStorage'
import { ResendEmailProvider } from '../src/services/orderNotification'
import { ProductModel } from '../src/models/productDocument'

const privateOrigin = 'https://private-store.example.chatgpt.site'
const adminToken = 'test-admin-token-with-at-least-32-characters'

function createApp() {
  env.ADMIN_API_TOKEN = adminToken
  return makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository())
}

const mockMongoProducts: ProductRepository = {
  getCatalogProducts: async () => [],
  findByIds: async () => [],
  getProductCount: async () => 0,
  getRecentProducts: async () => [],
  reserveStock: async () => true,
  releaseStock: async () => undefined,
}

const mockMongoOrders: OrderRepository = {
  findByIdempotencyKey: async () => undefined,
  findByOrderId: async () => undefined,
  create: async (order) => order,
  nextOrderId: async () => 'ORD-2026-000001',
  getOrderCount: async () => 0,
  getRecentOrders: async () => [],
  claimOrderCreatedNotification: async () => true,
}

const validProductionConfig = {
  NODE_ENV: 'production',
  DATABASE_URL: 'mongodb://127.0.0.1:27017/raja-store',
  PERSISTENCE_MODE: 'mongo',
  ADMIN_API_TOKEN: 'production-admin-token-with-sufficient-length',
  ADMIN_NOTIFICATION_EMAIL: 'owner@example.com',
  RESEND_API_KEY: 'resend-test-key',
  RESEND_FROM_EMAIL: 'orders@rajastore.in',
  CLOUDINARY_CLOUD_NAME: 'test-cloud-name',
  CLOUDINARY_API_KEY: 'cloudinary-api-key',
  CLOUDINARY_API_SECRET: 'cloudinary-api-secret',
}

describe('production security boundaries (SEC-01)', () => {
  it('allows only configured browser origins and exposes a request identifier', async () => {
    const originalAdditional = env.ADDITIONAL_FRONTEND_URLS
    env.ADDITIONAL_FRONTEND_URLS = [privateOrigin]
    try {
      const app = createApp()
      const allowed = await supertest(app).get('/api/health').set('Origin', privateOrigin)
      expect(allowed.status).toBe(200)
      expect(allowed.headers['access-control-allow-origin']).toBe(privateOrigin)
      expect(allowed.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

      const denied = await supertest(app).get('/api/health').set('Origin', 'https://attacker.example')
      expect(denied.status).toBe(403)
      expect(denied.body.code).toBe('CORS_ORIGIN_DENIED')
    } finally {
      env.ADDITIONAL_FRONTEND_URLS = originalAdditional
    }
  })

  it('accepts the admin token only in a Bearer authorization header', async () => {
    const app = createApp()
    const queryToken = await supertest(app).get(`/api/admin/does-not-exist?token=${encodeURIComponent(adminToken)}`)
    expect(queryToken.status).toBe(401)

    const bearerToken = await supertest(app)
      .get('/api/admin/does-not-exist')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(bearerToken.status).toBe(404)
  })

  it('rate-limits repeated failed admin authentication attempts', async () => {
    const app = createApp()
    let lastStatus = 0
    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastStatus = (await supertest(app).get('/api/admin/orders')).status
    }
    expect(lastStatus).toBe(429)
  })

  it('fails closed when production attempts to use memory persistence', () => {
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    try {
      // Memory repositories rejected
      expect(() => makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository(), true, 'mongo')).toThrow(
        'Production requires MongoDB repositories. In-memory repositories are forbidden in production.',
      )

      // Memory persistence mode rejected
      expect(() => makeApp(mockMongoProducts, mockMongoOrders, true, 'memory')).toThrow(
        'Production requires MongoDB persistence. Memory persistence is forbidden in production.',
      )

      // Disconnected database rejected
      expect(() => makeApp(mockMongoProducts, mockMongoOrders, false, 'mongo')).toThrow(
        'Production requires MongoDB persistence. Memory persistence is forbidden in production.',
      )
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })

  it('never registers or exposes development/debug routes in production', async () => {
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    try {
      const prodApp = makeApp(mockMongoProducts, mockMongoOrders, true, 'mongo')

      const devStatusResponse = await supertest(prodApp).get('/api/dev/database-status')
      expect(devStatusResponse.status).toBe(404)
      expect(devStatusResponse.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Not found.' })

      const devOrdersResponse = await supertest(prodApp).get('/api/dev/orders')
      expect(devOrdersResponse.status).toBe(404)
      expect(devOrdersResponse.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Not found.' })

      const unknownResponse = await supertest(prodApp).get('/api/not-a-real-route')
      expect(unknownResponse.status).toBe(404)
      expect(unknownResponse.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Not found.' })
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })

  it('fails config validation when required Mongo configuration is missing in production without leaking secrets', () => {
    // Missing DATABASE_URL
    expect(() => validateEnvironment({ ...validProductionConfig, DATABASE_URL: '' })).toThrowError(
      /DATABASE_URL is required in production\./,
    )

    // Missing PERSISTENCE_MODE (defaults to memory, which is rejected in production)
    const { PERSISTENCE_MODE: _, ...missingPersistence } = validProductionConfig
    expect(() => validateEnvironment(missingPersistence)).toThrowError(
      /PERSISTENCE_MODE must be mongo in production\./,
    )

    // Explicit PERSISTENCE_MODE=memory
    expect(() => validateEnvironment({ ...validProductionConfig, PERSISTENCE_MODE: 'memory' })).toThrowError(
      /PERSISTENCE_MODE must be mongo in production\./,
    )

    // Ensure error message does not expose secret values
    try {
      validateEnvironment({ ...validProductionConfig, DATABASE_URL: '' })
    } catch (err: unknown) {
      const message = (err as Error).message
      expect(message).toContain('DATABASE_URL is required in production.')
      expect(message).not.toContain(validProductionConfig.ADMIN_API_TOKEN)
      expect(message).not.toContain(validProductionConfig.CLOUDINARY_API_SECRET)
      expect(message).not.toContain(validProductionConfig.RESEND_API_KEY)
    }
  })

  it('preserves development and test behavior when not in production', async () => {
    // Test environment can instantiate with in-memory persistence
    const testApp = makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository(), false, 'memory')
    const healthResponse = await supertest(testApp).get('/api/health')
    expect(healthResponse.status).toBe(200)
    expect(healthResponse.body).toEqual({ success: true, status: 'ok' })

    // Valid production config parses successfully
    const validated = validateEnvironment(validProductionConfig)
    expect(validated.NODE_ENV).toBe('production')
    expect(validated.PERSISTENCE_MODE).toBe('mongo')
  })
})

describe('strict CORS origin protection (SEC-02)', () => {
  it('rejects arbitrary *.chatgpt.site subdomains when not explicitly configured', async () => {
    const app = createApp()

    const attacker1 = await supertest(app).get('/api/health').set('Origin', 'https://attacker.chatgpt.site')
    expect(attacker1.status).toBe(403)
    expect(attacker1.body).toEqual({
      success: false,
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not allowed.',
    })

    const attacker2 = await supertest(app).get('/api/health').set('Origin', 'https://malicious-store.chatgpt.site')
    expect(attacker2.status).toBe(403)
    expect(attacker2.body.code).toBe('CORS_ORIGIN_DENIED')
  })

  it('rejects unauthorized external origins', async () => {
    const app = createApp()

    const untrusted = await supertest(app).get('/api/health').set('Origin', 'https://evil-site.com')
    expect(untrusted.status).toBe(403)
    expect(untrusted.body).toEqual({
      success: false,
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not allowed.',
    })
  })

  it('allows the primary FRONTEND_URL', async () => {
    const app = createApp()

    const frontendOrigin = new URL(env.FRONTEND_URL).origin
    const res = await supertest(app).get('/api/health').set('Origin', frontendOrigin)
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(frontendOrigin)
  })

  it('allows origins explicitly listed in ADDITIONAL_FRONTEND_URLS', async () => {
    const originalAdditional = env.ADDITIONAL_FRONTEND_URLS
    env.ADDITIONAL_FRONTEND_URLS = ['https://trusted-private-store.example.com', 'https://allowed-canvas.chatgpt.site']
    try {
      const app = createApp()

      const res1 = await supertest(app).get('/api/health').set('Origin', 'https://trusted-private-store.example.com')
      expect(res1.status).toBe(200)
      expect(res1.headers['access-control-allow-origin']).toBe('https://trusted-private-store.example.com')

      const res2 = await supertest(app).get('/api/health').set('Origin', 'https://allowed-canvas.chatgpt.site')
      expect(res2.status).toBe(200)
      expect(res2.headers['access-control-allow-origin']).toBe('https://allowed-canvas.chatgpt.site')

      // Other unlisted .chatgpt.site remains rejected
      const res3 = await supertest(app).get('/api/health').set('Origin', 'https://unlisted.chatgpt.site')
      expect(res3.status).toBe(403)
      expect(res3.body.code).toBe('CORS_ORIGIN_DENIED')
    } finally {
      env.ADDITIONAL_FRONTEND_URLS = originalAdditional
    }
  })

  it('allows requests without an Origin header (server-to-server / curl / direct)', async () => {
    const app = createApp()

    const res = await supertest(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(res.body).toEqual({ success: true, status: 'ok' })
  })

  it('does not leak internal secrets or config in CORS denial responses', async () => {
    const app = createApp()

    const denied = await supertest(app).get('/api/health').set('Origin', 'https://attacker.example')
    expect(denied.status).toBe(403)
    const bodyStr = JSON.stringify(denied.body)
    expect(bodyStr).not.toContain(adminToken)
    expect(bodyStr).not.toContain('mongodb')
    expect(denied.body).toEqual({
      success: false,
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origin is not allowed.',
    })
  })
})

describe('production admin token length and order error safety (SEC-05)', () => {
  it('rejects an ADMIN_API_TOKEN shorter than 32 characters in production without exposing the token', () => {
    const shortTokenConfig = {
      ...validProductionConfig,
      ADMIN_API_TOKEN: 'short-token-under-32-chars',
    }

    expect(() => validateEnvironment(shortTokenConfig)).toThrowError(
      /ADMIN_API_TOKEN must be at least 32 characters long in production\./,
    )

    try {
      validateEnvironment(shortTokenConfig)
    } catch (err: unknown) {
      const message = (err as Error).message
      expect(message).toContain('ADMIN_API_TOKEN must be at least 32 characters long in production.')
      // Ensure the actual token value is NEVER reflected or exposed in error output
      expect(message).not.toContain('short-token-under-32-chars')
    }
  })

  it('accepts an ADMIN_API_TOKEN of at least 32 characters in production', () => {
    const validConfig = {
      ...validProductionConfig,
      ADMIN_API_TOKEN: 'a'.repeat(32),
    }
    const validated = validateEnvironment(validConfig)
    expect(validated.ADMIN_API_TOKEN).toBe('a'.repeat(32))
  })

  it('preserves development/test compatibility with shorter or empty tokens', () => {
    // Development environment allows short or empty tokens
    const devConfig = {
      NODE_ENV: 'development',
      ADMIN_API_TOKEN: 'dev-token',
    }
    const devValidated = validateEnvironment(devConfig)
    expect(devValidated.NODE_ENV).toBe('development')
    expect(devValidated.ADMIN_API_TOKEN).toBe('dev-token')

    // Test environment allows default empty token
    const testConfig = {
      NODE_ENV: 'test',
    }
    const testValidated = validateEnvironment(testConfig)
    expect(testValidated.NODE_ENV).toBe('test')
    expect(testValidated.ADMIN_API_TOKEN).toBe('')
  })

  it('sanitizes unexpected order creation errors to prevent leaking customer PII or stack traces in logs or response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const sensitiveCustomer = {
      fullName: 'Secret Customer Name',
      phone: '9876543210',
      email: 'secret.customer@private.com',
      address: '99 Confidential Boulevard, Penthouse 1A',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      notes: 'Secret door code 1234',
    }

    const failingOrderRepo: any = {
      findByIdempotencyKey: async () => {
        const dbErr = new Error(`MongoServerError: write error on customer document with address ${sensitiveCustomer.address}`)
        dbErr.name = 'MongoServerError'
        throw dbErr
      },
      nextOrderId: async () => 'ORD-2026-000001',
      create: async () => {
        throw new Error('Should not reach create')
      },
    }

    const app = makeApp(new InMemoryProductRepository(), failingOrderRepo, false, 'memory')

    try {
      const res = await supertest(app)
        .post('/api/orders')
        .send({
          items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
          customer: sensitiveCustomer,
          payment: { method: 'cod' },
        })

      // Client response must be generic 500 without leaking PII, stack traces, or DB internals
      expect(res.status).toBe(500)
      expect(res.body).toEqual({
        success: false,
        code: 'ORDER_CREATION_FAILED',
        message: 'Unable to process your order. Please try again.',
      })

      // Verify captured log output: console.error must have been called with safe metadata
      expect(consoleErrorSpy).toHaveBeenCalled()
      const calls = consoleErrorSpy.mock.calls
      const loggedString = JSON.stringify(calls)

      // Must NOT contain any customer PII or secrets
      expect(loggedString).not.toContain(sensitiveCustomer.fullName)
      expect(loggedString).not.toContain(sensitiveCustomer.email)
      expect(loggedString).not.toContain(sensitiveCustomer.address)
      expect(loggedString).not.toContain(sensitiveCustomer.notes)
      expect(loggedString).not.toContain('Secret door code')

      // Must only contain safe metadata tag and error name
      expect(calls[0][0]).toBe('[OrderCreationError]')
      expect(calls[0][1]).toEqual(
        expect.objectContaining({
          name: 'MongoServerError',
          requestId: expect.any(String),
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})

describe('production security improvements (SEC-06, SEC-07, SEC-08)', () => {
  describe('Cloudinary product image folder namespace isolation (SEC-06)', () => {
    it('restricts isValidProductImageReference to raja-store/products/ folder', () => {
      // Valid references inside raja-store/products/
      expect(isValidProductImageReference('cloudinary:raja-store/products/valid-img-01')).toBe(true)
      expect(isValidProductImageReference('cloudinary:raja-store/products/sub/valid-img-02')).toBe(true)

      // Invalid references outside raja-store/products/
      expect(isValidProductImageReference('cloudinary:raja-store/payment-proofs/proof-123')).toBe(false)
      expect(isValidProductImageReference('cloudinary:other-folder/photo')).toBe(false)
      expect(isValidProductImageReference('cloudinary:root-level-image')).toBe(false)
      expect(isValidProductImageReference('cloudinary:')).toBe(false)
    })

    it('CloudinaryProductImageStorage.get rejects references outside raja-store/products/', () => {
      const storage = new CloudinaryProductImageStorage({
        cloudName: 'test-cloud',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      })

      expect(() => storage.get('cloudinary:raja-store/payment-proofs/proof-123')).toThrowError('Product image not found.')
      expect(() => storage.get('cloudinary:other-folder/photo')).toThrowError('Product image not found.')
      expect(() => storage.get('cloudinary:root-image')).toThrowError('Product image not found.')
    })

    it('CloudinaryProductImageStorage.delete refuses to delete assets outside raja-store/products/', async () => {
      const storage = new CloudinaryProductImageStorage({
        cloudName: 'test-cloud',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      })
      const destroySpy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' })

      try {
        // Attempt deletion of asset outside raja-store/products/
        await storage.delete('cloudinary:raja-store/payment-proofs/stolen-proof')
        await storage.delete('cloudinary:other-folder/secret')
        expect(destroySpy).not.toHaveBeenCalled()

        // Valid deletion inside raja-store/products/ invokes destroy
        await storage.delete('cloudinary:raja-store/products/valid-photo')
        expect(destroySpy).toHaveBeenCalledWith('raja-store/products/valid-photo', expect.any(Object))
      } finally {
        destroySpy.mockRestore()
      }
    })

    it('serializeProductImage does not serialize references outside raja-store/products/ to Cloudinary CDN', () => {
      const valid = serializeProductImage('cloudinary:raja-store/products/item-1', 'prod_1', 'mycloud')
      expect(valid).toBe('https://res.cloudinary.com/mycloud/image/upload/raja-store/products/item-1')

      const invalid = serializeProductImage('cloudinary:raja-store/payment-proofs/secret-proof', 'prod_1', 'mycloud')
      expect(invalid).toBe('/api/products/prod_1/images/cloudinary:raja-store/payment-proofs/secret-proof')
    })
  })

  describe('Resend notification sender address configuration (SEC-07)', () => {
    it('rejects production config when RESEND_FROM_EMAIL is missing or empty', () => {
      expect(() =>
        validateEnvironment({ ...validProductionConfig, RESEND_FROM_EMAIL: '' }),
      ).toThrowError('RESEND_FROM_EMAIL is required in production.')

      const { RESEND_FROM_EMAIL: _, ...missingFromEmail } = validProductionConfig
      expect(() => validateEnvironment(missingFromEmail)).toThrowError('RESEND_FROM_EMAIL is required in production.')
    })

    it('accepts production config with valid RESEND_FROM_EMAIL', () => {
      const validated = validateEnvironment({
        ...validProductionConfig,
        RESEND_FROM_EMAIL: 'store-orders@rajastore.in',
      })
      expect(validated.RESEND_FROM_EMAIL).toBe('store-orders@rajastore.in')
    })

    it('preserves development/test fallback to onboarding@resend.dev', async () => {
      const devValidated = validateEnvironment({ NODE_ENV: 'development' })
      expect(devValidated.RESEND_FROM_EMAIL).toBe('')

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'res_123' }), { status: 200 }))
      try {
        const provider = new ResendEmailProvider(undefined, 'test-key')
        await provider.send({
          event: 'ORDER_CREATED',
          orderId: 'ORD-2026-000001',
          message: 'Order created',
          recipients: { email: 'admin@example.com' },
        })

        expect(fetchSpy).toHaveBeenCalled()
        const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
        expect(body.from).toBe('onboarding@resend.dev')
      } finally {
        fetchSpy.mockRestore()
      }
    })

    it('uses configured RESEND_FROM_EMAIL when provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'res_123' }), { status: 200 }))
      try {
        const provider = new ResendEmailProvider('orders@rajastore.in', 'test-key')
        await provider.send({
          event: 'ORDER_CREATED',
          orderId: 'ORD-2026-000001',
          message: 'Order created',
          recipients: { email: 'admin@example.com' },
        })

        expect(fetchSpy).toHaveBeenCalled()
        const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
        expect(body.from).toBe('orders@rajastore.in')
      } finally {
        fetchSpy.mockRestore()
      }
    })

    it('rejects in production when no sender email is configured without exposing API key', async () => {
      const originalEnv = env.NODE_ENV
      env.NODE_ENV = 'production'
      try {
        const provider = new ResendEmailProvider('', 'secret-resend-api-key')
        await expect(
          provider.send({
            event: 'ORDER_CREATED',
            orderId: 'ORD-2026-000001',
            message: 'Order created',
            recipients: { email: 'admin@example.com' },
          }),
        ).rejects.toThrowError('RESEND_FROM_EMAIL is not configured')
      } finally {
        env.NODE_ENV = originalEnv
      }
    })
  })

  describe('Admin bulk import request body size vs public 50kb limit (SEC-08)', () => {
    it('public endpoints reject JSON bodies exceeding 50 KB with HTTP 413', async () => {
      const app = createApp()
      const largePadding = 'x'.repeat(60 * 1024)
      const res = await supertest(app)
        .post('/api/orders')
        .set('Content-Type', 'application/json')
        .send({ padding: largePadding })

      expect(res.status).toBe(413)
    })

    it('admin bulk-import rejects unauthenticated requests with HTTP 401 without parsing body', async () => {
      const app = createApp()
      const largePayload = {
        products: Array.from({ length: 150 }, (_, i) => ({
          name: `Bulk Product ${i + 1}`,
          sku: `RS-BULK-${String(i + 1).padStart(4, '0')}`,
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 199,
          stock: 50,
          description: 'Detailed description with sufficient text to exceed standard payload sizes.'.repeat(5),
          images: [],
        })),
      }

      const res = await supertest(app)
        .post('/api/admin/products/bulk-import')
        .send(largePayload)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({
        success: false,
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Admin authorization required.',
      })
    })

    it('authenticated admin bulk-import accepts payloads larger than 50 KB', async () => {
      const app = createApp()
      const findOneSpy = vi.spyOn(ProductModel, 'findOne').mockResolvedValue(null as any)
      const createSpy = vi.spyOn(ProductModel, 'create').mockResolvedValue({} as any)
      const existsSpy = vi.spyOn(ProductModel, 'exists').mockResolvedValue(null as any)

      try {
        const products = Array.from({ length: 100 }, (_, i) => ({
          name: `Bulk Product ${i + 1}`,
          sku: `RS-BULK-SEC8-${String(i + 1).padStart(4, '0')}`,
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 199,
          stock: 50,
          description: 'Detailed description with sufficient text to exceed standard payload sizes.'.repeat(8),
          images: [],
        }))
        const largePayload = { products }
        const payloadString = JSON.stringify(largePayload)
        expect(Buffer.byteLength(payloadString)).toBeGreaterThan(50 * 1024)

        const res = await supertest(app)
          .post('/api/admin/products/bulk-import')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(largePayload)

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.totalProcessed).toBe(100)
      } finally {
        findOneSpy.mockRestore()
        createSpy.mockRestore()
        existsSpy.mockRestore()
      }
    })

    it('admin bulk-import rejects payloads that exceed the schema validation (max 1000 items)', async () => {
      const app = createApp()
      const oversizedPayload = {
        products: Array.from({ length: 1001 }, (_, i) => ({
          name: `Bulk Product ${i + 1}`,
          sku: `RS-BULK-OVER-${String(i + 1).padStart(4, '0')}`,
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 199,
          stock: 50,
          description: 'Description',
          images: [],
        })),
      }

      const res = await supertest(app)
        .post('/api/admin/products/bulk-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(oversizedPayload)

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })
  })
})


