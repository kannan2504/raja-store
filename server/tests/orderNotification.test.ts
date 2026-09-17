import { describe, expect, it, vi } from 'vitest'
import {
  AdminOrderNotificationService,
  DevelopmentWhatsAppProvider,
  GmailSmtpEmailProvider,
  OrderNotificationFormatter,
  ResendEmailProvider,
} from '../src/services/orderNotification'
import { env } from '../src/config/env'
import type { Order } from '../src/models/orderModel'
import { InMemoryProductRepository, type ProductRepository } from '../src/repositories/productRepository'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { createOrderSchema, OrderService } from '../src/services/orderService'
import { makeApp } from '../src/appFactory'
import supertest from 'supertest'

const order: Order = {
  orderId: 'ORD-2026-000099',
  idempotencyKey: 'notification-test',
  trackingTokenHash: 'private',
  customer: {
    fullName: 'Test Customer',
    phone: '9876543210',
    email: 'test@example.com',
    address: '12 Market Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
  },
  items: [
    {
      productId: 'prod_test',
      productNameSnapshot: 'Test Product',
      skuSnapshot: 'SKU-TEST',
      quantity: 2,
      unitPrice: 500,
      lineTotal: 1000,
    },
  ],
  pricing: { subtotal: 1000, deliveryCharge: 50, discount: 0, total: 1050 },
  payment: {
    method: 'cod',
    status: 'pending',
    utrNumber: null,
    proofFileId: null,
    verifiedAt: null,
    verifiedBy: null,
  },
  orderStatus: 'pending',
  createdAt: '2026-09-15T12:00:00.000Z',
  updatedAt: '2026-09-15T12:00:00.000Z',
}

const products = {
  findByIds: async () => [],
  getCatalogProducts: async () => [],
  getStockSnapshot: async () => ({ 'prod_test:default': 8 }),
  getProductCount: async () => 0,
  getRecentProducts: async () => [],
  reserveStock: async () => true,
  releaseStock: async () => undefined,
} as ProductRepository

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
    const service = new AdminOrderNotificationService(
      new OrderNotificationFormatter(products),
      { send: async () => undefined },
      { send: async () => undefined },
    )
    const claim = async () => {
      claims += 1
      return claims === 1
    }
    await service.notifyOrderCreated(order, claim)
    await service.notifyOrderCreated(order, claim)
    expect(claims).toBe(2)
  })

  it('successful order creation does not wait for a slow notification', async () => {
    const productRepo = new InMemoryProductRepository()
    const orderRepo = new InMemoryOrderRepository()

    // Mock email provider to simulate a 1000ms delay (e.g. SMTP latency)
    const slowEmailProvider = {
      send: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }),
    }

    const notificationService = new AdminOrderNotificationService(
      new OrderNotificationFormatter(productRepo),
      { send: async () => undefined },
      slowEmailProvider,
    )

    const orderService = new OrderService(productRepo, orderRepo, notificationService)
    const input = createOrderSchema.parse({
      items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
      customer: {
        fullName: 'Speedy Customer',
        phone: '9876543210',
        email: 'speedy@example.com',
        address: '12 Fast Track',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      },
      payment: { method: 'cod' },
    })

    const start = Date.now()
    const created = await orderService.createOrder(input, 'fast-checkout-test')
    const elapsed = Date.now() - start

    // Order creation must return almost immediately (< 300ms) without waiting for the 1000ms email
    expect(elapsed).toBeLessThan(300)
    expect(created.orderId).toBeDefined()
    expect(created.orderStatus).toBe('pending')
  })

  it('notification failure does not fail an already-created order or release stock', async () => {
    const productRepo = new InMemoryProductRepository()
    const orderRepo = new InMemoryOrderRepository()

    const releaseStockSpy = vi.spyOn(productRepo, 'releaseStock')

    // Mock email provider to throw a connection error
    const failingEmailProvider = {
      send: vi.fn().mockRejectedValue(new Error('ETIMEDOUT: Connection to smtp.gmail.com:587 failed')),
    }

    const notificationService = new AdminOrderNotificationService(
      new OrderNotificationFormatter(productRepo),
      { send: async () => undefined },
      failingEmailProvider,
    )

    const orderService = new OrderService(productRepo, orderRepo, notificationService)
    const input = createOrderSchema.parse({
      items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
      customer: {
        fullName: 'Resilient Customer',
        phone: '9876543210',
        email: 'resilient@example.com',
        address: '12 Safe St',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      },
      payment: { method: 'cod' },
    })

    // Order placement succeeds despite notification failure
    const created = await orderService.createOrder(input, 'resilient-order-test')
    expect(created.orderId).toBeDefined()

    // Wait for background promise tick
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Stock was NOT released because the order creation succeeded
    expect(releaseStockSpy).not.toHaveBeenCalled()

    // Status was NOT marked 'sent'; it was marked 'failed'
    const persisted = await orderRepo.findByOrderId(created.orderId)
    expect(persisted?.notification?.orderCreated.status).toBe('failed')
  })

  it('successful email updates notification status to sent', async () => {
    const productRepo = new InMemoryProductRepository()
    const orderRepo = new InMemoryOrderRepository()

    const successEmailProvider = {
      send: vi.fn().mockResolvedValue(undefined),
    }

    const notificationService = new AdminOrderNotificationService(
      new OrderNotificationFormatter(productRepo),
      { send: async () => undefined },
      successEmailProvider,
    )

    const orderService = new OrderService(productRepo, orderRepo, notificationService)
    const input = createOrderSchema.parse({
      items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
      customer: {
        fullName: 'Success Customer',
        phone: '9876543210',
        email: 'success@example.com',
        address: '12 Win St',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      },
      payment: { method: 'cod' },
    })

    const created = await orderService.createOrder(input, 'success-order-test')
    expect(created.orderId).toBeDefined()

    // Wait for background tick
    await new Promise((resolve) => setTimeout(resolve, 50))

    const persisted = await orderRepo.findByOrderId(created.orderId)
    expect(persisted?.notification?.orderCreated.status).toBe('sent')
    expect(persisted?.notification?.orderCreated.sentAt).toBeDefined()
  })

  it('duplicate/idempotent requests do not send duplicate successful emails', async () => {
    const productRepo = new InMemoryProductRepository()
    const orderRepo = new InMemoryOrderRepository()

    const sendSpy = vi.fn().mockResolvedValue(undefined)
    const emailProvider = { send: sendSpy }

    const notificationService = new AdminOrderNotificationService(
      new OrderNotificationFormatter(productRepo),
      { send: async () => undefined },
      emailProvider,
    )

    const orderService = new OrderService(productRepo, orderRepo, notificationService)
    const input = createOrderSchema.parse({
      items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
      customer: {
        fullName: 'Idempotent Customer',
        phone: '9876543210',
        email: 'idempotent@example.com',
        address: '12 Duplicate Rd',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      },
      payment: { method: 'cod' },
    })

    // First request
    const first = await orderService.createOrder(input, 'idempotency-key-abc')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sendSpy).toHaveBeenCalledTimes(1)

    // Second request with same idempotency key
    const second = await orderService.createOrder(input, 'idempotency-key-abc')
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Should return identical order and NOT invoke send a second time
    expect(second.orderId).toBe(first.orderId)
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('manual UPI order placement succeeds and initiates notification', async () => {
    const productRepo = new InMemoryProductRepository()
    const orderRepo = new InMemoryOrderRepository()

    const sendSpy = vi.fn().mockResolvedValue(undefined)
    const notificationService = new AdminOrderNotificationService(
      new OrderNotificationFormatter(productRepo),
      { send: async () => undefined },
      { send: sendSpy },
    )

    const orderService = new OrderService(productRepo, orderRepo, notificationService)
    const input = createOrderSchema.parse({
      items: [{ productId: 'prod_brass_dabba', quantity: 1 }],
      customer: {
        fullName: 'UPI Customer',
        phone: '9876543210',
        email: 'upi@example.com',
        address: '12 UPI Lane',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      },
      payment: {
        method: 'manual_upi',
        utrNumber: 'UTR-1234567890',
        proofFileId: 'cloudinary:raja-store/payment-proofs/sample-123',
      },
    })

    const created = await orderService.createOrder(input, 'upi-order-key')
    expect(created.orderId).toBeDefined()
    expect(created.payment.method).toBe('manual_upi')
    expect(created.payment.status).toBe('pending_verification')

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('DevelopmentWhatsAppProvider suppresses customer and order PII in production', async () => {
    const originalEnv = env.NODE_ENV
    ;(env as any).NODE_ENV = 'production'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      const provider = new DevelopmentWhatsAppProvider()
      await provider.send({
        event: 'ORDER_CREATED',
        orderId: 'ORD-2026-999999',
        message: 'CUSTOMER\nName: Secret User\nPhone: 9999999999\nUTR: UTR-SECRET\nAddress: 99 Private Way',
        recipients: { whatsapp: '9876543210' },
      })

      // Must not print the message body or PII
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')
      expect(output).not.toContain('Secret User')
      expect(output).not.toContain('9999999999')
      expect(output).not.toContain('UTR-SECRET')
      expect(output).not.toContain('99 Private Way')
      expect(output).toContain('ORD-2026-999999')
      expect(output).toContain('external provider unconfigured')
    } finally {
      ;(env as any).NODE_ENV = originalEnv
      consoleSpy.mockRestore()
    }
  })

  it('DevelopmentWhatsAppProvider safely no-ops in production when WhatsApp recipient is unconfigured', async () => {
    const originalEnv = env.NODE_ENV
    ;(env as any).NODE_ENV = 'production'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      const provider = new DevelopmentWhatsAppProvider()
      await provider.send({
        event: 'ORDER_CREATED',
        orderId: 'ORD-2026-888888',
        message: 'Sensitive info',
        recipients: {},
      })

      expect(consoleSpy).not.toHaveBeenCalled()
    } finally {
      ;(env as any).NODE_ENV = originalEnv
      consoleSpy.mockRestore()
    }
  })

  it('ResendEmailProvider sends order notification via Resend API', async () => {
    const originalApiKey = env.RESEND_API_KEY
    ;(env as any).RESEND_API_KEY = 're_test_key_12345'

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-resend-123' }),
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as any

    try {
      const provider = new ResendEmailProvider()
      await provider.send({
        event: 'ORDER_CREATED',
        orderId: 'ORD-2026-000099',
        message: 'Test notification body',
        recipients: { email: 'admin@example.com' },
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_test_key_12345',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: ['admin@example.com'],
          subject: 'New Raja Store order ORD-2026-000099',
          text: 'Test notification body',
        }),
      })
    } finally {
      ;(env as any).RESEND_API_KEY = originalApiKey
      globalThis.fetch = originalFetch
    }
  })

  it('ResendEmailProvider throws descriptive error when Resend API returns non-200 response', async () => {
    const originalApiKey = env.RESEND_API_KEY
    ;(env as any).RESEND_API_KEY = 're_test_key_12345'

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '{"message":"Invalid API key"}',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as any

    try {
      const provider = new ResendEmailProvider()
      await expect(
        provider.send({
          event: 'ORDER_CREATED',
          orderId: 'ORD-2026-000099',
          message: 'Test notification body',
          recipients: { email: 'admin@example.com' },
        }),
      ).rejects.toThrow('Resend API error (403): {"message":"Invalid API key"}')
    } finally {
      ;(env as any).RESEND_API_KEY = originalApiKey
      globalThis.fetch = originalFetch
    }
  })

  it('ResendEmailProvider throws error when RESEND_API_KEY is not configured', async () => {
    const originalApiKey = env.RESEND_API_KEY
    ;(env as any).RESEND_API_KEY = ''

    try {
      const provider = new ResendEmailProvider()
      await expect(
        provider.send({
          event: 'ORDER_CREATED',
          orderId: 'ORD-2026-000099',
          message: 'Test notification body',
          recipients: { email: 'admin@example.com' },
        }),
      ).rejects.toThrow('RESEND_API_KEY is not configured')
    } finally {
      ;(env as any).RESEND_API_KEY = originalApiKey
    }
  })

  it('Express app configures trust proxy 1 and rate limits without X-Forwarded-For error', async () => {
    const productRepo = new InMemoryProductRepository()
    const orderRepo = new InMemoryOrderRepository()
    const app = makeApp(productRepo, orderRepo)

    expect(app.get('trust proxy')).toBe(1)

    // Rate-limited route POST /api/orders with X-Forwarded-For
    const response = await supertest(app)
      .post('/api/orders')
      .set('X-Forwarded-For', '203.0.113.195')
      .send({})

    // The endpoint will respond with 400 validation error, not 500 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
    expect(response.status).toBe(400)
    expect(response.body.code).not.toBe('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')
  })
})
