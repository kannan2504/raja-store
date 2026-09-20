import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { makeApp } from '../src/appFactory'
import { env, validateEnvironment } from '../src/config/env'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { InMemoryProductRepository } from '../src/repositories/productRepository'
import { MongoOrderRepository } from '../src/repositories/mongoOrderRepository'
import { MongoProductRepository } from '../src/repositories/mongoProductRepository'
import type { OrderRepository } from '../src/repositories/orderRepository'
import type { ProductRepository } from '../src/repositories/productRepository'

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
  CLOUDINARY_CLOUD_NAME: 'test-cloud-name',
  CLOUDINARY_API_KEY: 'cloudinary-api-key',
  CLOUDINARY_API_SECRET: 'cloudinary-api-secret',
}

describe('production security boundaries (SEC-01)', () => {
  it('allows only configured browser origins and exposes a request identifier', async () => {
    const app = createApp()
    const allowed = await supertest(app).get('/api/health').set('Origin', privateOrigin)
    expect(allowed.status).toBe(200)
    expect(allowed.headers['access-control-allow-origin']).toBe(privateOrigin)
    expect(allowed.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

    const denied = await supertest(app).get('/api/health').set('Origin', 'https://attacker.example')
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('CORS_ORIGIN_DENIED')
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
