import { z } from 'zod'

export const adminProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(2000),
  shortDescription: z.string().trim().min(1).max(300),
  sku: z.string().trim().min(2).max(60),
  category: z.object({ slug: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(80) }),
  price: z.number().finite().nonnegative(),
  compareAtPrice: z.number().finite().nonnegative().optional(),
  stock: z.number().int().nonnegative().max(100000),
  images: z.array(z.string()).max(5).default([]),
  variants: z.array(z.object({ id: z.string().min(1), sku: z.string().min(1), label: z.string().min(1), price: z.number().finite().nonnegative().optional(), stock: z.number().int().nonnegative().max(100000), options: z.record(z.string(), z.string()) })).max(50).default([]),
  active: z.boolean().default(true),
  rating: z.number().finite().min(0).max(5).optional(),
  isNew: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  tone: z.string().max(30).optional(),
})

export const adminProductPatchSchema = adminProductSchema.partial()
export const adminStockSchema = z.object({ stock: z.number().int().nonnegative().max(100000) })
