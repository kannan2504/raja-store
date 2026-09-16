import { ProductModel } from '../models/productDocument'
import type { CatalogProduct, ServerProduct } from '../models/productModel'
import type { ProductRepository } from './productRepository'
import type { DevelopmentProduct } from './developmentRepository'

function toServerProduct(product: Record<string, unknown>): ServerProduct {
  return { id: product.productId as string, name: product.name as string, sku: product.sku as string, price: product.price as number, stock: product.stock as number, isActive: product.active as boolean, variants: (product.variants ?? []) as ServerProduct['variants'] }
}

export class MongoProductRepository implements ProductRepository {
  async getCatalogProducts(): Promise<CatalogProduct[]> { return (await ProductModel.find({ active: true }).sort({ createdAt: -1 }).lean()).map((product) => ({ id: product.productId, name: product.name, slug: product.slug, description: product.description, shortDescription: product.shortDescription, price: product.price, compareAtPrice: product.compareAtPrice ?? undefined, images: (product.images ?? []).map((image) => `/api/products/${product.productId}/images/${image}`), category: product.category as { slug: string; name: string }, stock: product.stock, sku: product.sku, variants: (product.variants ?? []).map((variant) => ({ id: variant.id, sku: variant.sku, label: variant.label, price: variant.price ?? undefined, stock: variant.stock, options: variant.options })), isActive: product.active, rating: product.rating ?? undefined, isNew: product.isNew ?? undefined, isBestSeller: product.isBestSeller ?? undefined, tone: product.tone ?? undefined })) }
  async findByIds(ids: string[]) { const products = await ProductModel.find({ productId: { $in: ids }, active: true }).lean(); return products.map((product) => toServerProduct(product as Record<string, unknown>)) }
  async getProductCount() { return ProductModel.countDocuments({ active: true }) }
  async getRecentProducts(limit: number): Promise<DevelopmentProduct[]> { const products = await ProductModel.find({ active: true }).sort({ createdAt: -1 }).limit(limit).lean(); return products.map((product) => ({ productId: product.productId, name: product.name, sku: product.sku, price: product.price, stock: product.stock })) }
  async reserveStock(items: Array<{ productId: string; quantity: number; variantId?: string }>) {
    const reserved: Array<{ productId: string; quantity: number; variantId?: string }> = []
    for (const item of items) {
      const filter = item.variantId ? { productId: item.productId, active: true, variants: { $elemMatch: { id: item.variantId, stock: { $gte: item.quantity } } } } : { productId: item.productId, active: true, stock: { $gte: item.quantity } }
      const update = item.variantId ? { $inc: { 'variants.$.stock': -item.quantity } } : { $inc: { stock: -item.quantity } }
      const updated = await ProductModel.findOneAndUpdate(filter, update, { new: true })
      if (!updated) {
        for (const previous of reserved) {
          const rollback = previous.variantId ? { $inc: { 'variants.$.stock': previous.quantity } } : { $inc: { stock: previous.quantity } }
          await ProductModel.findOneAndUpdate({ productId: previous.productId, ...(previous.variantId ? { 'variants.id': previous.variantId } : {}) }, rollback)
        }
        return false
      }
      reserved.push(item)
    }
    return true
  }
  async releaseStock(items: Array<{ productId: string; quantity: number; variantId?: string }>) { for (const item of items) { const update = item.variantId ? { $inc: { 'variants.$.stock': item.quantity } } : { $inc: { stock: item.quantity } }; await ProductModel.findOneAndUpdate({ productId: item.productId, ...(item.variantId ? { 'variants.id': item.variantId } : {}) }, update) } }
  async getStockSnapshot(items: Array<{ productId: string; variantId?: string }>) { const products = await ProductModel.find({ productId: { $in: items.map((item) => item.productId) } }).lean(); return Object.fromEntries(items.map((item) => { const product = products.find((candidate) => candidate.productId === item.productId); const variant = product?.variants?.find((candidate) => candidate.id === item.variantId); return [`${item.productId}:${item.variantId ?? 'default'}`, variant?.stock ?? product?.stock ?? 0] })) }
}
