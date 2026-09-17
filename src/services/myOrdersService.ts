/* ==========================================================================
   MY ORDERS — localStorage persistence service
   Stores minimal order references on the customer's current device.
   No sensitive data (no address, payment proof, UTR) is stored.
   ========================================================================== */

export type StoredOrder = {
  orderId: string       // "ORD-2026-000001"
  total: number         // total in rupees
  paymentMethod: string // "cod" | "manual_upi"
  paymentStatus: string // "pending" | "pending_verification"
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
    return parsed.filter(
      (item): item is StoredOrder =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).orderId === 'string' &&
        typeof (item as Record<string, unknown>).total === 'number' &&
        typeof (item as Record<string, unknown>).paymentMethod === 'string' &&
        typeof (item as Record<string, unknown>).paymentStatus === 'string' &&
        typeof (item as Record<string, unknown>).placedAt === 'string',
    )
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
