import type { CatalogProduct, ServerProduct } from '../models/productModel'
import type { DevelopmentProduct } from './developmentRepository'

export interface ProductRepository {
  findByIds(ids: string[]): Promise<ServerProduct[]>
  getCatalogProducts(): Promise<CatalogProduct[]>
  getProductCount(): Promise<number>
  getRecentProducts(limit: number): Promise<DevelopmentProduct[]>
  reserveStock(items: Array<{ productId: string; quantity: number; variantId?: string }>): Promise<boolean>
  releaseStock(items: Array<{ productId: string; quantity: number; variantId?: string }>): Promise<void>
  getStockSnapshot(items: Array<{ productId: string; variantId?: string }>): Promise<Record<string, number>>
}

const demoProducts: ServerProduct[] = [
  { id: 'prod_brass_dabba', name: 'Brass Dabba Set', sku: 'RS-KIT-001', price: 899, stock: 18, isActive: true, variants: [] },
  { id: 'prod_jute_tote', name: 'Handwoven Jute Tote', sku: 'RS-EVE-002', price: 649, stock: 7, isActive: true, variants: [{ id: 'var_tote_natural', sku: 'RS-EVE-002-NAT', label: 'Natural', stock: 7, options: { color: 'Natural' } }] },
  { id: 'prod_neem_comb', name: 'Neem Wood Comb', sku: 'RS-WEL-003', price: 249, stock: 0, isActive: true, variants: [] },
  { id: 'prod_ajrakh_runner', name: 'Ajrakh Table Runner', sku: 'RS-HOM-004', price: 1199, stock: 24, isActive: true, variants: [{ id: 'var_runner_long', sku: 'RS-HOM-004-LNG', label: '180 cm', stock: 24, options: { size: '180 cm' } }] },
  { id: 'prod_ceramic_mug', name: 'Dune Ceramic Mug', sku: 'RS-HOM-005', price: 499, stock: 12, isActive: true, variants: [{ id: 'var_mug_350', sku: 'RS-HOM-005-350', label: '350 ml', stock: 12, options: { size: '350 ml' } }] },
  { id: 'prod_cotton_napkins', name: 'Kala Cotton Napkins', sku: 'RS-HOM-006', price: 799, stock: 5, isActive: true, variants: [] },
]

export class InMemoryProductRepository implements ProductRepository {
  async getCatalogProducts(): Promise<CatalogProduct[]> { return demoProducts.map((product) => ({ ...product, slug: product.id, description: '', shortDescription: '', images: [], category: { slug: 'demo', name: 'Demo' } })) }
  async findByIds(ids: string[]) {
    return demoProducts.filter((product) => ids.includes(product.id))
  }
  async getProductCount() { return demoProducts.length }
  async getRecentProducts(limit: number): Promise<DevelopmentProduct[]> { return demoProducts.slice(0, limit).map(({ id, name, sku, price, stock }) => ({ productId: id, name, sku, price, stock })) }
  async reserveStock(items: Array<{ productId: string; quantity: number; variantId?: string }>) {
    const reserved: Array<{ product: ServerProduct; quantity: number; variantId?: string }> = []
    for (const item of items) {
      const product = demoProducts.find((candidate) => candidate.id === item.productId)
      const variant = product?.variants.find((candidate) => candidate.id === item.variantId)
      const stockOwner = variant ?? product
      if (!stockOwner || stockOwner.stock < item.quantity) { for (const previous of reserved) { const owner = previous.variantId ? previous.product.variants.find((candidate) => candidate.id === previous.variantId) : previous.product; if (owner) owner.stock += previous.quantity }; return false }
      stockOwner.stock -= item.quantity
      if (!product) return false
      reserved.push({ product, quantity: item.quantity, variantId: item.variantId })
    }
    return true
  }
  async releaseStock(items: Array<{ productId: string; quantity: number; variantId?: string }>) { for (const item of items) { const product = demoProducts.find((candidate) => candidate.id === item.productId); const owner = item.variantId ? product?.variants.find((candidate) => candidate.id === item.variantId) : product; if (owner) owner.stock += item.quantity } }
  async getStockSnapshot(items: Array<{ productId: string; variantId?: string }>) { return Object.fromEntries(items.map((item) => { const product = demoProducts.find((candidate) => candidate.id === item.productId); const owner = item.variantId ? product?.variants.find((candidate) => candidate.id === item.variantId) : product; return [`${item.productId}:${item.variantId ?? 'default'}`, owner?.stock ?? 0] })) }
}
