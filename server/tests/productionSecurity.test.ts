import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { makeApp } from '../src/appFactory'
import { env } from '../src/config/env'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { InMemoryProductRepository } from '../src/repositories/productRepository'

const privateOrigin = 'https://private-store.example.chatgpt.site'
const adminToken = 'test-admin-token-with-at-least-32-characters'

function createApp() {
  env.ADMIN_API_TOKEN = adminToken
  return makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository())
}

describe('production security boundaries', () => {
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

  it('returns a generic JSON 404 and disables development endpoints in production', async () => {
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    const app = createApp()
    env.NODE_ENV = previousNodeEnv

    const development = await supertest(app).get('/api/dev/database-status')
    expect(development.status).toBe(404)
    expect(development.body.code).toBe('NOT_FOUND')

    const unknown = await supertest(app).get('/api/not-a-real-route')
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Not found.' })
  })
})
