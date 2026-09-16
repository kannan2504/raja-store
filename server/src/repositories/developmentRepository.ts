export type DevelopmentProduct = {
  productId: string
  name: string
  sku: string
  price: number
  stock: number
}

export type DevelopmentOrder = {
  orderId: string
  customerName: string
  maskedPhone: string
  total: number
  paymentMethod: string
  paymentStatus: string
  orderStatus: string
  createdAt: string
}

export type DevelopmentDataRepository = {
  getProductCount(): Promise<number>
  getOrderCount(): Promise<number>
  getRecentProducts(limit: number): Promise<DevelopmentProduct[]>
  getRecentOrders(limit: number): Promise<DevelopmentOrder[]>
}

export function maskPhone(phone: string) {
  return phone.length > 5 ? `${phone.slice(0, 5)}${'*'.repeat(phone.length - 5)}` : '*****'
}
