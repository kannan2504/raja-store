import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { env } from '../config/env'
import type { Order } from '../models/orderModel'
import type { ProductRepository } from '../repositories/productRepository'
import { InMemoryOrderRepository, type OrderRepository } from '../repositories/orderRepository'
import { HttpError } from '../utils/httpError'
import type { AdminOrderNotificationService } from './orderNotification'

const itemSchema = z.object({
  productId: z.string().regex(/^prod_[a-z0-9_]+$/, 'Invalid product ID'),
  quantity: z.number().int().positive().max(env.MAX_ITEM_QUANTITY),
  variantId: z.string().regex(/^var_[a-z0-9_]+$/).optional(),
})

const paymentSchema = z.object({
  method: z.enum(['cod', 'manual_upi']),
  utrNumber: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/).optional(),
  proofFileId: z.string().uuid().optional(),
})

export const createOrderSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
  customer: z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
    email: z.string().trim().email().max(160).optional().or(z.literal('')),
    address: z.string().trim().min(5).max(300),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid Indian pincode'),
    notes: z.string().trim().max(500).optional(),
  }),
  payment: paymentSchema,
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

const defaultOrderRepository = new InMemoryOrderRepository()

export function resetOrderStoreForTests() {
  defaultOrderRepository.clear()
}

export class OrderService {
  constructor(private readonly products: ProductRepository, private readonly orders: OrderRepository = defaultOrderRepository, private readonly notifications?: AdminOrderNotificationService) {}

  async createOrder(input: CreateOrderInput, idempotencyKey: string): Promise<Order> {
    const previous = await this.orders.findByIdempotencyKey(idempotencyKey)
    if (previous) { if (this.notifications) await this.notifications.notifyOrderCreated(previous, () => this.orders.claimOrderCreatedNotification(previous.orderId)); return previous }
    if (input.payment.method === 'manual_upi' && (!input.payment.utrNumber || !input.payment.proofFileId)) throw new HttpError(400, 'PAYMENT_PROOF_REQUIRED', 'Please provide your UPI transaction ID and payment screenshot.')

    const requestedIds = [...new Set(input.items.map((item) => item.productId))]
    const products = await this.products.findByIds(requestedIds)
    if (products.length !== requestedIds.length) throw new HttpError(400, 'PRODUCT_NOT_FOUND', 'One or more products could not be found.')

    const items = input.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId)
      if (!product || !product.isActive) throw new HttpError(400, 'PRODUCT_NOT_FOUND', 'One or more products are unavailable.')
      const variant = item.variantId ? product.variants.find((candidate) => candidate.id === item.variantId) : undefined
      if (item.variantId && !variant) throw new HttpError(400, 'PRODUCT_NOT_FOUND', 'One or more product options are unavailable.')
      const stock = variant?.stock ?? product.stock
      if (item.quantity > stock) throw new HttpError(409, 'OUT_OF_STOCK', 'One or more products are no longer available in the requested quantity.')
      const unitPrice = variant?.price ?? product.price
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        skuSnapshot: variant?.sku ?? product.sku,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
        ...(variant ? { variant: { id: variant.id, label: variant.label, sku: variant.sku, options: variant.options } } : {}),
      }
    })

    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0)
    if (subtotal < env.MINIMUM_ORDER_VALUE) throw new HttpError(400, 'MINIMUM_ORDER_NOT_MET', `Minimum order value is ₹${env.MINIMUM_ORDER_VALUE}.`)
    const reserved = await this.products.reserveStock(input.items)
    if (!reserved) throw new HttpError(409, 'OUT_OF_STOCK', 'One or more products are no longer available in the requested quantity.')
    const deliveryCharge = env.DELIVERY_CHARGE
    const now = new Date().toISOString()
    const trackingToken = randomBytes(32).toString('hex')
    const trackingTokenHash = createHash('sha256').update(trackingToken).digest('hex')
    const order: Order = {
      orderId: await this.orders.nextOrderId(new Date().getFullYear()),
      idempotencyKey,
      trackingTokenHash,
      customer: input.customer,
      items,
      pricing: { subtotal, deliveryCharge, discount: 0, total: subtotal + deliveryCharge },
      payment: { method: input.payment.method, status: input.payment.method === 'manual_upi' ? 'pending_verification' : 'pending', utrNumber: input.payment.utrNumber ?? null, proofFileId: input.payment.proofFileId ?? null, verifiedAt: null, verifiedBy: null },
      orderStatus: 'pending',
      createdAt: now,
      updatedAt: now,
      notification: { orderCreated: { status: 'pending', event: 'ORDER_CREATED', sentAt: null } },
    }
    try { const created = await this.orders.create(order); if (this.notifications) await this.notifications.notifyOrderCreated(created, () => this.orders.claimOrderCreatedNotification(created.orderId)); return created } catch (_error) { await this.products.releaseStock(input.items); throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again.') }
  }

  async trackOrder(orderId: string, phone: string) {
    const order = await this.orders.findByOrderId(orderId)
    if (!order || order.customer.phone !== phone) throw new HttpError(404, 'ORDER_VERIFICATION_FAILED', 'Unable to verify the order details.')
    return { orderId: order.orderId, status: order.orderStatus, payment: { method: order.payment.method, status: order.payment.status }, items: order.items.map(({ productId: _productId, skuSnapshot, ...item }) => item), subtotal: order.pricing.subtotal, deliveryCharge: order.pricing.deliveryCharge, total: order.pricing.total, shippingAddress: { address: order.customer.address, city: order.customer.city, state: order.customer.state, pincode: order.customer.pincode } }
  }
}

export function makeIdempotencyKey(value?: string) {
  return value?.trim().slice(0, 100) || randomUUID()
}
