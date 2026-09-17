import type { Category, Product } from '../types/product'
import { API_BASE_URL } from '../config'

/**
 * Resolve a product image URL to an absolute URL.
 * - If the value already starts with http:// or https://, return it unchanged.
 * - If it starts with /api/, prefix it with VITE_API_BASE_URL so it points at
 *   the backend (e.g. https://raja-store.onrender.com) rather than the Vercel
 *   frontend origin where the /api/ path does not exist.
 * - Otherwise return it as-is (relative paths such as placeholders).
 */
export function resolveImageUrl(url: string): string {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/api/')) return `${API_BASE_URL}${url}`
  return url
}

const demoImage = (label: string, width = 900) => `https://placehold.co/${width}x1100/f3eadb/29382a?text=${encodeURIComponent(`${label} demo`)}`

const categories: Category[] = [
  { slug: 'kitchen', name: 'Kitchen' },
  { slug: 'everyday', name: 'Everyday' },
  { slug: 'wellness', name: 'Wellness' },
  { slug: 'home', name: 'Home' },
]

export const demoProducts: Product[] = [
  {
    id: 'prod_brass_dabba', name: 'Brass Dabba Set', slug: 'brass-dabba-set',
    description: 'A warm, enduring set of brass storage tins for spices, snacks, and the small treasures that make a kitchen yours. Each piece is finished by hand in Moradabad.',
    shortDescription: 'A set of three hand-finished brass tins.', price: 899, compareAtPrice: 1099,
    images: [demoImage('Brass Dabba Set'), demoImage('Brass Dabba Set detail')], category: categories[0], stock: 18, sku: 'RS-KIT-001', variants: [], isActive: true, rating: 4.9, isBestSeller: true, tone: 'mustard',
  },
  {
    id: 'prod_jute_tote', name: 'Handwoven Jute Tote', slug: 'handwoven-jute-tote',
    description: 'A sturdy everyday carry woven from natural jute by a small artisan collective in West Bengal. Roomy enough for market mornings and slow afternoons.',
    shortDescription: 'A natural jute carryall for everyday errands.', price: 649, compareAtPrice: 799,
    images: [demoImage('Handwoven Jute Tote'), demoImage('Jute Tote detail')], category: categories[1], stock: 7, sku: 'RS-EVE-002', variants: [{ id: 'var_tote_natural', sku: 'RS-EVE-002-NAT', label: 'Natural', stock: 7, options: { color: 'Natural' } }], isActive: true, rating: 4.8, tone: 'terracotta',
  },
  {
    id: 'prod_neem_comb', name: 'Neem Wood Comb', slug: 'neem-wood-comb',
    description: 'Hand-carved from sustainably sourced neem wood, this wide-tooth comb is gentle on the scalp and made to become part of your daily ritual.',
    shortDescription: 'A hand-carved comb for a gentler ritual.', price: 249,
    images: [demoImage('Neem Wood Comb'), demoImage('Neem Comb detail')], category: categories[2], stock: 0, sku: 'RS-WEL-003', variants: [], isActive: true, rating: 4.7, isNew: true, tone: 'olive',
  },
  {
    id: 'prod_ajrakh_runner', name: 'Ajrakh Table Runner', slug: 'ajrakh-table-runner',
    description: 'Printed by hand using the centuries-old Ajrakh technique, this cotton runner brings deep indigo and quiet pattern to the table.',
    shortDescription: 'Hand-block printed cotton for the table.', price: 1199, compareAtPrice: 1499,
    images: [demoImage('Ajrakh Table Runner'), demoImage('Table Runner detail')], category: categories[3], stock: 24, sku: 'RS-HOM-004', variants: [{ id: 'var_runner_long', sku: 'RS-HOM-004-LNG', label: '180 cm', stock: 24, options: { size: '180 cm' } }], isActive: true, rating: 4.9, tone: 'indigo',
  },
  {
    id: 'prod_ceramic_mug', name: 'Dune Ceramic Mug', slug: 'dune-ceramic-mug',
    description: 'A softly shaped stoneware mug with a sandy glaze, made in small batches for chai, coffee, and everything in between.',
    shortDescription: 'A quiet stoneware mug for daily pauses.', price: 499, compareAtPrice: 599,
    images: [demoImage('Dune Ceramic Mug'), demoImage('Ceramic Mug detail')], category: categories[3], stock: 12, sku: 'RS-HOM-005', variants: [{ id: 'var_mug_350', sku: 'RS-HOM-005-350', label: '350 ml', stock: 12, options: { size: '350 ml' } }], isActive: true, rating: 4.8, isNew: true, tone: 'mustard',
  },
  {
    id: 'prod_cotton_napkins', name: 'Kala Cotton Napkins', slug: 'kala-cotton-napkins',
    description: 'A set of four naturally textured napkins woven from Kala cotton, a hardy native fibre grown by farming communities in Kutch.',
    shortDescription: 'A set of four naturally textured napkins.', price: 799,
    images: [demoImage('Kala Cotton Napkins'), demoImage('Cotton Napkins detail')], category: categories[3], stock: 5, sku: 'RS-HOM-006', variants: [], isActive: true, rating: 4.6, isBestSeller: true, tone: 'olive',
  },
]

export async function getProducts(): Promise<Product[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/products`)
    if (response.ok) {
      const payload = await response.json() as { success: boolean; products?: Product[] }
      if (payload.success && payload.products) return payload.products.map((product) => ({
        ...product,
        // Resolve every image URL to an absolute URL at the fetch boundary so
        // all downstream components (card, gallery, cart, admin) work without
        // per-site changes.
        images: product.images.length > 0
          ? product.images.map(resolveImageUrl)
          : [getProductImage(product)],
      }))
    }
  } catch { /* The storefront shows no stale or fictional stock in production. */ }
  return import.meta.env.DEV ? demoProducts.filter((product) => product.isActive) : []
}

export function getProductImage(product: Product, index = 0): string {
  const raw = product.images[index] ?? `https://placehold.co/900x1100/f3eadb/29382a?text=${encodeURIComponent(`${product.name} demo`)}`
  return resolveImageUrl(raw)
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await getProducts()).find((product) => product.slug === slug)
}

export function getProductCategories(products: Product[]): Category[] {
  return products.reduce<Category[]>((result, product) => result.some((category) => category.slug === product.category.slug) ? result : [...result, product.category], [])
}
