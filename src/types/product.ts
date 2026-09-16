export type ProductVariantOption = {
  name: 'size' | 'color' | 'weight' | 'pack'
  values: string[]
}

export type ProductVariant = {
  id: string
  sku: string
  label: string
  price?: number
  stock: number
  options: Partial<Record<ProductVariantOption['name'], string>>
}

export type Category = {
  slug: string
  name: string
}

export type Product = {
  id: string
  name: string
  slug: string
  description: string
  shortDescription: string
  price: number
  compareAtPrice?: number
  images: string[]
  category: Category
  stock: number
  sku: string
  variants: ProductVariant[]
  isActive: boolean
  rating: number
  isNew?: boolean
  isBestSeller?: boolean
  tone: string
}
