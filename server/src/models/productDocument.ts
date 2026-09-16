import { Schema, model, type InferSchemaType } from 'mongoose'

const variantSchema = new Schema({
  id: { type: String, required: true }, sku: { type: String, required: true }, label: { type: String, required: true }, price: Number, stock: { type: Number, required: true, min: 0 }, options: { type: Map, of: String, default: {} },
}, { _id: false })

const productSchema = new Schema({
  productId: { type: String, required: true, unique: true, index: true }, name: { type: String, required: true }, slug: { type: String, required: true, unique: true, index: true }, description: { type: String, required: true }, shortDescription: { type: String, required: true }, sku: { type: String, required: true, unique: true, index: true }, category: { slug: String, name: String }, price: { type: Number, required: true, min: 0 }, compareAtPrice: Number, discount: { type: Number, min: 0 }, stock: { type: Number, required: true, min: 0 }, images: { type: [String], default: [] }, variants: [variantSchema], active: { type: Boolean, default: true, index: true }, rating: Number, isNew: Boolean, isBestSeller: Boolean, tone: String,
}, { timestamps: true, versionKey: false })

export type ProductDocument = InferSchemaType<typeof productSchema>
export const ProductModel = model('Product', productSchema)
