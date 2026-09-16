import { OrderModel } from '../models/orderDocument'
import { CounterModel } from '../models/counterDocument'
import type { Order } from '../models/orderModel'
import type { OrderRepository } from './orderRepository'
import type { DevelopmentOrder } from './developmentRepository'

function toOrder(document: Record<string, unknown>): Order {
  const { _id: _internalId, createdAt, updatedAt, ...order } = document
  return { ...order, createdAt: new Date(createdAt as string).toISOString(), updatedAt: new Date(updatedAt as string).toISOString() } as Order
}

export class MongoOrderRepository implements OrderRepository {
  async findByIdempotencyKey(key: string) { const document = await OrderModel.findOne({ idempotencyKey: key }).lean(); return document ? toOrder(document as Record<string, unknown>) : undefined }
  async findByOrderId(orderId: string) { const document = await OrderModel.findOne({ orderId }).lean(); return document ? toOrder(document as Record<string, unknown>) : undefined }
  async create(order: Order) { const document = await OrderModel.create(order); return toOrder(document.toObject() as Record<string, unknown>) }
  async nextOrderId(year: number) { const counter = await CounterModel.findOneAndUpdate({ _id: `orders-${year}` }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }); return `ORD-${year}-${String(counter.value).padStart(6, '0')}` }
  async getOrderCount() { return OrderModel.countDocuments() }
  async getRecentOrders(limit: number): Promise<DevelopmentOrder[]> { const orders = await OrderModel.find().sort({ createdAt: -1 }).limit(limit).lean(); return orders.map((order) => { const customer = (order.customer ?? {}) as { fullName?: string | null; phone?: string | null }; const pricing = (order.pricing ?? {}) as { total?: number | null }; const payment = (order.payment ?? {}) as { method?: string | null; status?: string | null }; const phone = customer.phone ?? ''; return { orderId: order.orderId ?? 'unknown', customerName: customer.fullName ?? 'Unknown customer', maskedPhone: phone.length > 5 ? `${phone.slice(0, 5)}*****` : '*****', total: pricing.total ?? 0, paymentMethod: payment.method ?? 'unknown', paymentStatus: payment.status ?? 'unknown', orderStatus: order.orderStatus ?? 'unknown', createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date(0).toISOString() } }) }
  async claimOrderCreatedNotification(orderId: string) { const updated = await OrderModel.findOneAndUpdate({ orderId, $or: [{ 'notification.orderCreated.status': { $exists: false } }, { 'notification.orderCreated.status': { $ne: 'sent' } }] }, { $set: { 'notification.orderCreated.status': 'sent', 'notification.orderCreated.event': 'ORDER_CREATED', 'notification.orderCreated.sentAt': new Date() } }, { new: true }); return Boolean(updated) }
}
