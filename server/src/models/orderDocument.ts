import { Schema, model, type InferSchemaType } from 'mongoose'

const orderItemSchema = new Schema({ productId: String, productNameSnapshot: String, skuSnapshot: String, quantity: Number, unitPrice: Number, lineTotal: Number, variant: { id: String, label: String, sku: String, options: { type: Map, of: String } } }, { _id: false })
const orderSchema = new Schema({
  orderId: { type: String, required: true, unique: true, index: true }, idempotencyKey: { type: String, required: true, unique: true, index: true }, trackingTokenHash: { type: String, required: true, index: true },
  customer: { fullName: String, phone: { type: String, index: true }, email: String, address: String, city: String, state: String, pincode: String, notes: String },
  items: [orderItemSchema], pricing: { subtotal: Number, deliveryCharge: Number, discount: Number, total: Number }, payment: { method: String, status: { type: String, index: true }, utrNumber: String, proofFileId: String, verifiedAt: Date, verifiedBy: String }, orderStatus: { type: String, index: true }, notification: { orderCreated: { status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' }, event: { type: String, enum: ['ORDER_CREATED'], default: 'ORDER_CREATED' }, sentAt: Date } },
}, { timestamps: true, versionKey: false })
orderSchema.index({ createdAt: -1 })

export type OrderDocument = InferSchemaType<typeof orderSchema>
export const OrderModel = model('Order', orderSchema)
