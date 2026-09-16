export type DevelopmentProduct = { productId: string; name: string; sku: string; price: number; stock: number }
export type DevelopmentOrder = { orderId: string; customerName: string; maskedPhone: string; total: number; paymentMethod: string; paymentStatus: string; orderStatus: string; createdAt: string }
export type DevelopmentStatus = { success: true; environment: string; persistenceMode: string; databaseConnected: boolean; productCount: number; orderCount: number; recentProducts: DevelopmentProduct[]; recentOrders: DevelopmentOrder[] }

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

export async function getDevelopmentDatabaseStatus() {
  const response = await fetch(`${API_BASE_URL}/api/dev/database-status`)
  const payload = await response.json() as DevelopmentStatus | { success: false; message?: string }
  if (!response.ok || !payload.success) throw new Error(payload.success ? 'Unable to load database status.' : payload.message ?? 'Unable to load database status.')
  return payload
}
