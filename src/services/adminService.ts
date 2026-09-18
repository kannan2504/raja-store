import { API_BASE_URL } from '../config'

export type AdminOrder = { orderId: string; customer: { fullName: string; phone: string; email?: string; address: string; city: string; state: string; pincode: string }; items: Array<{ productNameSnapshot: string; quantity: number; unitPrice: number; lineTotal: number; skuSnapshot: string }>; pricing: { subtotal: number; deliveryCharge: number; total: number }; payment: { method: string; status: string; utrNumber?: string | null; proofFileId?: string | null }; orderStatus: string; notification?: { status: string; event: string; sentAt: string | null }; createdAt: string }
export type AdminProduct = { productId: string; name: string; slug?: string; description?: string; shortDescription?: string; category?: { slug: string; name: string }; sku: string; price: number; compareAtPrice?: number; stock: number; active?: boolean; images?: string[]; variants?: Array<{ id: string; sku: string; label: string; price?: number; stock: number; options: Record<string, string> }> }
async function adminFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> { const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options?.headers ?? {}) } }); const contentType = response.headers.get('content-type') ?? ''; if (!contentType.includes('application/json')) throw new Error(`Admin API returned ${response.status} ${response.statusText}.`); const payload = await response.json() as T & { message?: string }; if (!response.ok) throw new Error(payload.message ?? 'Admin request failed'); return payload }
async function adminFetchBlob(path: string, token: string): Promise<string> { const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) { const contentType = response.headers.get('content-type') ?? ''; if (contentType.includes('application/json')) { const payload = await response.json() as { message?: string }; throw new Error(payload.message ?? `Request failed (${response.status})`); } throw new Error(`Request failed (${response.status})`); } const blob = await response.blob(); return URL.createObjectURL(blob) }
function productForm(product: Record<string, unknown>, files: File[], imageOrder: string[]) { const body = new FormData(); body.append('product', JSON.stringify(product)); body.append('imageOrder', JSON.stringify(imageOrder)); files.forEach((file) => body.append('images', file, file.name)); return body }
export type BulkImportProductInput = {
  name: string
  slug?: string
  sku: string
  category: { name: string; slug: string }
  price: number
  compareAtPrice?: number
  stock: number
  description: string
  shortDescription?: string
  images: string[]
  active?: boolean
  isBestSeller?: boolean
  isNew?: boolean
  tone?: string
}

export type BulkImportResult = {
  success: true
  createdCount: number
  updatedCount: number
  totalProcessed: number
}

export const adminApi = {
  orders: (token: string) => adminFetch<{ success: true; orders: AdminOrder[] }>('/api/admin/orders', token),
  products: (token: string) => adminFetch<{ success: true; products: AdminProduct[] }>('/api/admin/products', token),
  createProduct: (token: string, product: Record<string, unknown>, files: File[], imageOrder: string[]) => adminFetch<{ success: true; product: AdminProduct }>('/api/admin/products', token, { method: 'POST', body: productForm(product, files, imageOrder) }),
  updateProduct: (token: string, id: string, product: Record<string, unknown>, files: File[], imageOrder: string[]) => adminFetch<{ success: true; product: AdminProduct }>(`/api/admin/products/${encodeURIComponent(id)}`, token, { method: 'PATCH', body: productForm(product, files, imageOrder) }),
  updateStock: (token: string, id: string, stock: number) => adminFetch<{ success: true; product: AdminProduct }>(`/api/admin/products/${encodeURIComponent(id)}/stock`, token, { method: 'PATCH', body: JSON.stringify({ stock }) }),
  order: (token: string, id: string) => adminFetch<{ success: true; order: AdminOrder }>(`/api/admin/orders/${encodeURIComponent(id)}`, token),
  status: (token: string, id: string, orderStatus: string) => adminFetch(`/api/admin/orders/${encodeURIComponent(id)}/status`, token, { method: 'PATCH', body: JSON.stringify({ orderStatus }) }),
  payment: (token: string, id: string, paymentStatus: string) => adminFetch(`/api/admin/orders/${encodeURIComponent(id)}/payment`, token, { method: 'PATCH', body: JSON.stringify({ paymentStatus }) }),
  paymentProof: (token: string, orderId: string) => adminFetchBlob(`/api/admin/orders/${encodeURIComponent(orderId)}/payment-proof`, token),
  bulkUploadImages: (token: string, files: File[]) => {
    const body = new FormData()
    files.forEach((file) => body.append('images', file, file.name))
    return adminFetch<{ success: true; uploaded: Array<{ filename: string; reference: string }> }>(
      '/api/admin/products/bulk-upload-image',
      token,
      { method: 'POST', body }
    )
  },
  bulkImport: (token: string, products: BulkImportProductInput[]) =>
    adminFetch<BulkImportResult>('/api/admin/products/bulk-import', token, {
      method: 'POST',
      body: JSON.stringify({ products }),
    }),
  deleteProduct: (token: string, id: string) =>
    adminFetch<{ success: true; productId: string }>(`/api/admin/products/${encodeURIComponent(id)}`, token, { method: 'DELETE' }),
}

export function downloadProductTemplateCsv() {
  const csvContent = `sku,name,category,price,compareAtPrice,stock,shortDescription,description,active,isBestSeller,isNew,tone
RS-KIT-TEA01,Stainless Steel Tea Filter,Kitchen,89,120,50,Fine double-mesh stainless steel strainer for daily tea and chai.,Durable food-grade stainless steel tea filter designed with a sturdy resting ring and insulated handle. Perfect for filtering chai and decoction.,TRUE,TRUE,FALSE,mustard
RS-BAT-MUG01,Heavy Duty Plastic Bath Mug,Everyday,49,75,80,1-litre ribbed plastic mug with comfortable thumb-grip.,Made of unbreakable virgin polypropylene plastic. Features an ergonomic grip and smooth pouring rim for daily utility use.,TRUE,TRUE,FALSE,terracotta
RS-CLN-MOP01,Cotton Floor Cleaning Mop,Home,249,349,35,Super-absorbent looped cotton yarn mop with lightweight steel rod.,High-density 100% bleached cotton strands offer superior water absorption and quick dirt pickup. Includes an anti-rust powder-coated handle.,TRUE,FALSE,TRUE,olive
RS-ACC-HB01,Soft Fabric Elastic Hair Bands (Pack of 12),Everyday,79,120,60,No-crease snag-free stretch hair ties for daily styling.,Gentle seamless fabric elastic bands that hold hair firmly without pulling or breakage. Everyday assorted neutral and pastel colors.,TRUE,FALSE,TRUE,indigo
RS-JWL-EAR01,Traditional Brass Jhumka Earrings,Accessories,199,299,25,Lightweight antique gold-finish floral dome jhumkas.,Exquisitely detailed brass earrings with intricate filigree cutwork and delicate bottom hanging beads. Ideal for festive and daily ethnic wear.,TRUE,TRUE,FALSE,mustard`

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'raja_products_template.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

