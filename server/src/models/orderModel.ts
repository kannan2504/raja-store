import type { ServerProductVariant } from './productModel'

export type OrderItem = {
  productId: string
  productNameSnapshot: string
  skuSnapshot: string
  quantity: number
  unitPrice: number
  lineTotal: number
  variant?: Pick<ServerProductVariant, 'id' | 'label' | 'sku' | 'options'>
}

export type Order = {
  orderId: string
  idempotencyKey: string
  trackingTokenHash: string
  customer: {
    fullName: string
    phone: string
    email?: string
    address: string
    city: string
    state: string
    pincode: string
    notes?: string
  }
  items: OrderItem[]
  pricing: {
    subtotal: number
    deliveryCharge: number
    discount: number
    total: number
  }
  payment: {
    method: 'cod' | 'manual_upi'
    status: 'pending' | 'pending_verification' | 'paid' | 'failed' | 'rejected'
    utrNumber: string | null
    proofFileId: string | null
    verifiedAt: string | null
    verifiedBy: string | null
  }
  orderStatus: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled'
  createdAt: string
  updatedAt: string
  notification?: {
    orderCreated: { status: 'pending' | 'sent' | 'failed'; event: 'ORDER_CREATED'; sentAt: string | null }
  }
}
