export type ServerProductVariant = {
  id: string
  sku: string
  label: string
  price?: number
  stock: number
  options: Record<string, string>
}

export type ServerProduct = {
  id: string
  name: string
  sku: string
  price: number
  stock: number
  isActive: boolean
  variants: ServerProductVariant[]
}

export type CatalogProduct = ServerProduct & {
  slug: string
  description: string
  shortDescription: string
  compareAtPrice?: number
  images: string[]
  category: { slug: string; name: string }
  rating?: number
  isNew?: boolean
  isBestSeller?: boolean
  tone?: string
}
