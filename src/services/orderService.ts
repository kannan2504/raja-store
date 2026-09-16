import type { CartItem } from '../context/CartContext'

type CustomerDetails = {
  fullName: string
  phone: string
  email?: string
  address: string
  city: string
  state: string
  pincode: string
  notes?: string
}

type OrderResponse = {
  success: true
  order: { orderId: string; total: number; status: string; paymentMethod: string; paymentStatus: string }
}

type OrderError = {
  success: false
  code: string
  message: string
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

export async function createOrder(customer: CustomerDetails, items: CartItem[], requestKey: string, payment: { method: 'cod' | 'manual_upi'; utrNumber?: string; proof?: File }): Promise<OrderResponse> {
  const body = new FormData()
  body.append('items', JSON.stringify(items.map((item) => ({ productId: item.product.id, quantity: item.quantity, ...(item.variant ? { variantId: item.variant.id } : {}) }))))
  body.append('customer', JSON.stringify(customer))
  body.append('paymentMethod', payment.method)
  if (payment.utrNumber) body.append('utrNumber', payment.utrNumber)
  if (payment.proof) body.append('paymentProof', payment.proof, payment.proof.name)
  const response = await fetch(`${API_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Idempotency-Key': requestKey },
    body,
  })
  const payload = await response.json() as OrderResponse | OrderError
  if (!response.ok || !payload.success) throw new Error(payload.success ? 'Unable to process your order.' : payload.message)
  return payload
}

export type TrackedOrder = {
  orderId: string
  status: string
  payment: { method: string; status: string }
  items: Array<{ productNameSnapshot: string; quantity: number; unitPrice: number; lineTotal: number; skuSnapshot: string }>
  subtotal: number
  deliveryCharge: number
  total: number
  shippingAddress: { address: string; city: string; state: string; pincode: string }
}

export async function trackOrder(orderId: string, phone: string): Promise<TrackedOrder> {
  const response = await fetch(`${API_BASE_URL}/api/orders/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, phone }) })
  const payload = await response.json() as { success: boolean; order?: TrackedOrder; message?: string }
  if (!response.ok || !payload.success || !payload.order) throw new Error(payload.message ?? 'Unable to verify the order details.')
  return payload.order
}
