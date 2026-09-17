import { describe, expect, it } from 'vitest'
import supertest from 'supertest'
import { app } from '../src/app'

describe('Cross-Origin-Resource-Policy configuration', () => {
  it('serves public product images with Cross-Origin-Resource-Policy: cross-origin', async () => {
    const response = await supertest(app).get('/api/products/prod_123/images/00000000-0000-0000-0000-000000000000.png')
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })

  it('preserves Cross-Origin-Resource-Policy: same-origin on standard API routes', async () => {
    const response = await supertest(app).get('/api/health')
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin')
  })

  it('preserves Cross-Origin-Resource-Policy: same-origin on admin endpoints', async () => {
    const response = await supertest(app).get('/api/admin/orders/ORD-123/payment-proof')
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin')
  })
})
