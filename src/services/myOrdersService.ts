/* ==========================================================================
   MY ORDERS — localStorage persistence service
   Stores minimal non-sensitive order references on the customer's device.
   No phone number, address, payment proof, or UTR is stored here.
   Order fulfillment status is cached locally; for the latest live status
   the customer uses the Track Order page (Order ID + phone required).
   ========================================================================== */

export type StoredOrder = {
  orderId: string       // "ORD-2026-000001"
  total: number         // total in rupees
  paymentMethod: string // "cod" | "manual_upi"
  orderStatus: string   // fulfillment status: pending, confirmed, processing, shipped, out_for_delivery, delivered, cancelled
  placedAt: string      // ISO 8601 timestamp (client-side)
}

const STORAGE_KEY = 'raja-store-my-orders'
const MAX_ORDERS = 50

export function getMyOrders(): StoredOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Map each item, handling both new format (orderStatus) and old format (paymentStatus → fallback to 'pending')
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).orderId === 'string' &&
          typeof (item as Record<string, unknown>).total === 'number' &&
          typeof (item as Record<string, unknown>).paymentMethod === 'string' &&
          typeof (item as Record<string, unknown>).placedAt === 'string',
      )
      .map((item): StoredOrder => ({
        orderId: item.orderId as string,
        total: item.total as number,
        paymentMethod: item.paymentMethod as string,
        // Prefer new orderStatus field; fall back to 'pending' for legacy stored orders
        orderStatus: typeof item.orderStatus === 'string' ? item.orderStatus : 'pending',
        placedAt: item.placedAt as string,
      }))
  } catch {
    return []
  }
}

export function appendMyOrder(order: StoredOrder): void {
  try {
    const existing = getMyOrders()
    // Idempotent: skip if this orderId is already stored
    if (existing.some((o) => o.orderId === order.orderId)) return
    // Prepend newest first, cap at MAX_ORDERS
    const updated = [order, ...existing].slice(0, MAX_ORDERS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors (private browsing / quota exceeded)
  }
}

/** Update just the orderStatus for an existing stored order. */
export function updateMyOrderStatus(orderId: string, newStatus: string): void {
  try {
    const existing = getMyOrders()
    const updated = existing.map((o) =>
      o.orderId === orderId ? { ...o, orderStatus: newStatus } : o
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors
  }
}
