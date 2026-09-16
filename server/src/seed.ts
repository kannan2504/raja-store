import { connectDatabase } from './config/database'
import { env } from './config/env'
import { ProductModel } from './models/productDocument'

const products = [
  { productId: 'prod_brass_dabba', name: 'Brass Dabba Set', slug: 'brass-dabba-set', description: 'A warm, enduring set of brass storage tins.', shortDescription: 'A set of three hand-finished brass tins.', sku: 'RS-KIT-001', category: { slug: 'kitchen', name: 'Kitchen' }, price: 899, compareAtPrice: 1099, stock: 18, active: true, images: [], variants: [], rating: 4.9, isBestSeller: true, tone: 'mustard' },
  { productId: 'prod_jute_tote', name: 'Handwoven Jute Tote', slug: 'handwoven-jute-tote', description: 'A sturdy everyday carry woven from natural jute.', shortDescription: 'A natural jute carryall for everyday errands.', sku: 'RS-EVE-002', category: { slug: 'everyday', name: 'Everyday' }, price: 649, compareAtPrice: 799, stock: 7, active: true, images: [], variants: [{ id: 'var_tote_natural', sku: 'RS-EVE-002-NAT', label: 'Natural', stock: 7, options: { color: 'Natural' } }], rating: 4.8, tone: 'terracotta' },
  { productId: 'prod_neem_comb', name: 'Neem Wood Comb', slug: 'neem-wood-comb', description: 'Hand-carved from sustainably sourced neem wood.', shortDescription: 'A hand-carved comb for a gentler ritual.', sku: 'RS-WEL-003', category: { slug: 'wellness', name: 'Wellness' }, price: 249, stock: 0, active: true, images: [], variants: [], rating: 4.7, isNew: true, tone: 'olive' },
  { productId: 'prod_ajrakh_runner', name: 'Ajrakh Table Runner', slug: 'ajrakh-table-runner', description: 'Printed by hand using the centuries-old Ajrakh technique.', shortDescription: 'Hand-block printed cotton for the table.', sku: 'RS-HOM-004', category: { slug: 'home', name: 'Home' }, price: 1199, compareAtPrice: 1499, stock: 24, active: true, images: [], variants: [{ id: 'var_runner_long', sku: 'RS-HOM-004-LNG', label: '180 cm', stock: 24, options: { size: '180 cm' } }], rating: 4.9, tone: 'indigo' },
  { productId: 'prod_ceramic_mug', name: 'Dune Ceramic Mug', slug: 'dune-ceramic-mug', description: 'A softly shaped stoneware mug with a sandy glaze.', shortDescription: 'A quiet stoneware mug for daily pauses.', sku: 'RS-HOM-005', category: { slug: 'home', name: 'Home' }, price: 499, compareAtPrice: 599, stock: 12, active: true, images: [], variants: [{ id: 'var_mug_350', sku: 'RS-HOM-005-350', label: '350 ml', stock: 12, options: { size: '350 ml' } }], rating: 4.8, isNew: true, tone: 'mustard' },
  { productId: 'prod_cotton_napkins', name: 'Kala Cotton Napkins', slug: 'kala-cotton-napkins', description: 'A set of four naturally textured napkins.', shortDescription: 'A set of four naturally textured napkins.', sku: 'RS-HOM-006', category: { slug: 'home', name: 'Home' }, price: 799, stock: 5, active: true, images: [], variants: [], rating: 4.6, isBestSeller: true, tone: 'olive' },
]

async function seed() {
  if (env.NODE_ENV === 'production' || env.PERSISTENCE_MODE !== 'mongo' || !env.DATABASE_URL) throw new Error('Seed requires NODE_ENV=development, PERSISTENCE_MODE=mongo, and DATABASE_URL')
  await connectDatabase()
  await ProductModel.bulkWrite(products.map((product) => ({ updateOne: { filter: { productId: product.productId }, update: { $set: product }, upsert: true } })) as never)
  console.log(`Seeded ${products.length} demo products`)
  process.exit(0)
}
void seed().catch((error) => { console.error('Seed failed', error); process.exit(1) })
