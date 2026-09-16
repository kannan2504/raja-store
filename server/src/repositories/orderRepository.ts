import type { Order } from '../models/orderModel'
import type { DevelopmentOrder } from './developmentRepository'

export interface OrderRepository {
  findByIdempotencyKey(key: string): Promise<Order | undefined>
  findByOrderId(orderId: string): Promise<Order | undefined>
  create(order: Order): Promise<Order>
  nextOrderId(year: number): Promise<string>
  getOrderCount(): Promise<number>
  getRecentOrders(limit: number): Promise<DevelopmentOrder[]>
  claimOrderCreatedNotification(orderId: string): Promise<boolean>
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly byKey = new Map<string, Order>()
  private readonly byId = new Map<string, Order>()
  private sequence = 1
  async findByIdempotencyKey(key: string) { return this.byKey.get(key) }
  async findByOrderId(orderId: string) { return this.byId.get(orderId) }
  async create(order: Order) { this.byKey.set(order.idempotencyKey, order); this.byId.set(order.orderId, order); return order }
  async nextOrderId(year: number) { return `ORD-${year}-${String(this.sequence++).padStart(6, '0')}` }
  async getOrderCount() { return this.byId.size }
  async getRecentOrders(limit: number): Promise<DevelopmentOrder[]> { return [...this.byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((order) => ({ orderId: order.orderId, customerName: order.customer.fullName, maskedPhone: `${order.customer.phone.slice(0, 5)}*****`, total: order.pricing.total, paymentMethod: order.payment.method, paymentStatus: order.payment.status, orderStatus: order.orderStatus, createdAt: order.createdAt })) }
  async claimOrderCreatedNotification(orderId: string) { const order = this.byId.get(orderId); if (!order || order.notification?.orderCreated.status === 'sent') return false; order.notification = { orderCreated: { status: 'sent', event: 'ORDER_CREATED', sentAt: new Date().toISOString() } }; return true }
  clear() { this.byKey.clear(); this.byId.clear(); this.sequence = 1 }
}
