import type { Request, Response } from 'express'
import { OrderModel } from '../models/orderDocument'
import { ProductModel } from '../models/productDocument'
import { randomUUID } from 'node:crypto'
import { adminBulkImportSchema, adminProductPatchSchema, adminProductSchema, adminStockSchema } from '../validators/adminProduct'
import { ZodError } from 'zod'
import { isValidProductImageReference, type ProductImageStorage } from '../services/productImageStorage'

export async function listAdminOrders(_request: Request, response: Response) { const orders = await OrderModel.find().sort({ createdAt: -1 }).limit(100).lean(); response.json({ success: true, orders: orders.map((order) => ({ orderId: order.orderId, customer: { fullName: order.customer?.fullName, phone: order.customer?.phone }, pricing: { total: order.pricing?.total }, payment: { method: order.payment?.method, status: order.payment?.status,   proofFileId: order.payment?.proofFileId ?? null }, orderStatus: order.orderStatus, notification: order.notification?.orderCreated, createdAt: order.createdAt })) }) }
export async function getAdminOrder(request: Request, response: Response) { const order = await OrderModel.findOne({ orderId: request.params.orderId }).lean(); if (!order) return response.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found.' }); const { trackingTokenHash: _trackingTokenHash, _id: _internalId, ...safeOrder } = order; response.json({ success: true, order: safeOrder }) }
export async function updateAdminOrder(request: Request, response: Response) { const allowed = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled']; if (!allowed.includes(request.body.orderStatus)) return response.status(400).json({ success: false, code: 'INVALID_ORDER_STATUS', message: 'Invalid order status.' }); const order = await OrderModel.findOneAndUpdate({ orderId: request.params.orderId }, { $set: { orderStatus: request.body.orderStatus, updatedAt: new Date() } }, { new: true }); if (!order) return response.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found.' }); response.json({ success: true, order: { orderId: order.orderId, orderStatus: order.orderStatus } }) }
export async function updateAdminPayment(request: Request, response: Response) { const allowed = ['pending', 'pending_verification', 'paid', 'failed', 'rejected']; if (!allowed.includes(request.body.paymentStatus)) return response.status(400).json({ success: false, code: 'INVALID_PAYMENT_STATUS', message: 'Invalid payment status.' }); const order = await OrderModel.findOneAndUpdate({ orderId: request.params.orderId }, { $set: { 'payment.status': request.body.paymentStatus, 'payment.verifiedAt': request.body.paymentStatus === 'paid' ? new Date() : null, updatedAt: new Date() } }, { new: true }); if (!order) return response.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', message: 'Order not found.' }); response.json({ success: true, order: { orderId: order.orderId, paymentStatus: order.payment?.status ?? request.body.paymentStatus } }) }
export async function listAdminProducts(_request: Request, response: Response) { const products = await ProductModel.find().sort({ name: 1 }).lean(); response.json({ success: true, products: products.map((product) => ({ productId: product.productId, name: product.name, slug: product.slug, description: product.description, shortDescription: product.shortDescription, category: product.category, sku: product.sku, price: product.price, compareAtPrice: product.compareAtPrice, stock: product.stock, active: product.active, images: product.images ?? [], variants: product.variants })) }) }
function formatValidationError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'field'}: ${issue.message}`).join(', ')
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallbackMessage
}

function multipartProductBody(request: Request) {
  if (!request.is('multipart/form-data')) {
    return {
      body: request.body,
      files: [] as Express.Multer.File[],
      imageOrder: undefined as string[] | undefined,
    }
  }

  const files = (request.files as Express.Multer.File[] | undefined) ?? []

  let body = request.body.product ?? request.body
  let imageOrder: string[] = []

  try {
    if (typeof body === 'string') {
      body = JSON.parse(body)
    }

    if (request.body.imageOrder) {
      imageOrder =
        typeof request.body.imageOrder === 'string'
          ? JSON.parse(request.body.imageOrder)
          : request.body.imageOrder
    }
  } catch {
    throw new Error('Invalid product form data.')
  }

  return {
    body,
    files,
    imageOrder,
  }
}
import { toSlug } from '../utils/slug'

export async function resolveUniqueSlug(baseSlug: string, excludeProductId?: string): Promise<string> {
  const cleanBase = toSlug(baseSlug) || 'product'
  let candidate = cleanBase
  let counter = 2
  while (true) {
    const filter: Record<string, unknown> = { slug: candidate }
    if (excludeProductId) {
      filter.productId = { $ne: excludeProductId }
    }
    const exists = await ProductModel.exists(filter)
    if (!exists) {
      return candidate
    }
    candidate = `${cleanBase}-${counter}`
    counter++
  }
}

export function makeAdminProductController(storage: ProductImageStorage) { return {
	create: async (request: Request, response: Response) => { let uploaded: string[] = []; try { const parts = multipartProductBody(request); uploaded = await Promise.all(parts.files.map((file) => storage.upload(file))); const byIndex = new Map(uploaded.map((reference, index) => [`file:${index}`, reference])); const images = (parts.imageOrder ?? uploaded.map((_, index) => `file:${index}`)).map((token: string) => byIndex.get(token)).filter((value: string | undefined): value is string => Boolean(value)); const input = adminProductSchema.parse({ ...parts.body, images }); if (input.images.length < 1 || input.images.length > 5) throw new Error('Product requires 1 to 5 images.'); const product = await ProductModel.create({ ...input, productId: `prod_${randomUUID().replaceAll('-', '').slice(0, 16)}` }); response.status(201).json({ success: true, product: { productId: product.productId, name: product.name, sku: product.sku, price: product.price, stock: product.stock, active: product.active, images: product.images } }) } catch (error) { await Promise.all(uploaded.map((image) => storage.delete(image))); if (error instanceof ZodError || (error instanceof Error && error.message === 'Product requires 1 to 5 images.')) return response.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: formatValidationError(error, 'Please check the product details.') }); if ((error as { code?: number }).code === 11000) return response.status(409).json({ success: false, code: 'PRODUCT_ALREADY_EXISTS', message: 'A product with this slug or SKU already exists.' }); throw error } },
	update: async (request: Request, response: Response) => { let uploaded: string[] = []; try { const parts = multipartProductBody(request); const existing = await ProductModel.findOne({ productId: request.params.productId }); if (!existing) return response.status(404).json({ success: false, code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' }); uploaded = await Promise.all(parts.files.map((file) => storage.upload(file))); const byIndex = new Map(uploaded.map((reference, index) => [`file:${index}`, reference])); const existingImages = (existing.images ?? []).filter((img): img is string => typeof img === 'string'); const orderedTokens = parts.imageOrder ?? [...existingImages.map((image) => `ref:${image}`), ...uploaded.map((_, index) => `file:${index}`)]; const images = orderedTokens.map((token: string) => token.startsWith('ref:') ? token.slice(4) : byIndex.get(token)).filter(isValidProductImageReference); if (images.length > 5) throw new Error('A product can have at most 5 images.'); const input = adminProductPatchSchema.parse({ ...parts.body, images }); const product = await ProductModel.findOneAndUpdate({ productId: request.params.productId }, { $set: input }, { new: true, runValidators: true }); const removed = existingImages.filter((image) => !images.includes(image)); await Promise.all(removed.map((image: string) => storage.delete(image))); response.json({ success: true, product: { productId: product!.productId, name: product!.name, sku: product!.sku, price: product!.price, stock: product!.stock, active: product!.active, images: product!.images } }) } catch (error) { await Promise.all(uploaded.map((image) => storage.delete(image))); if (error instanceof ZodError || (error instanceof Error && (error.message.includes('images') || error.message.includes('Product requires')))) return response.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: formatValidationError(error, 'Please check the product images.') }); if ((error as { code?: number }).code === 11000) return response.status(409).json({ success: false, code: 'PRODUCT_ALREADY_EXISTS', message: 'A product with this slug or SKU already exists.' }); throw error } },
	bulkUploadImages: async (request: Request, response: Response) => {
		const files = (request.files as Express.Multer.File[] | undefined) ?? []
		if (files.length === 0) {
			return response.status(400).json({ success: false, code: 'NO_FILES', message: 'No image files provided.' })
		}
		try {
			const uploaded = await Promise.all(
				files.map(async (file) => {
					const reference = await storage.upload({
						originalname: file.originalname,
						mimetype: file.mimetype,
						size: file.size,
						buffer: file.buffer,
					})
					return {
						filename: file.originalname,
						reference,
					}
				})
			)
			response.json({ success: true, uploaded })
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Image upload failed.'
			response.status(400).json({ success: false, code: 'UPLOAD_FAILED', message })
		}
	},
	bulkImport: async (request: Request, response: Response) => {
		const parsed = adminBulkImportSchema.safeParse(request.body)
		if (!parsed.success) {
			return response.status(400).json({
				success: false,
				code: 'VALIDATION_ERROR',
				message: formatValidationError(parsed.error, 'Invalid bulk import data.'),
			})
		}

		const { products } = parsed.data
		const skuSet = new Set<string>()
		for (const item of products) {
			const lowerSku = item.sku.toLowerCase()
			if (skuSet.has(lowerSku)) {
				return response.status(400).json({
					success: false,
					code: 'DUPLICATE_SKU_IN_PAYLOAD',
					message: `Duplicate SKU found in import list: ${item.sku}`,
				})
			}
			skuSet.add(lowerSku)
		}

		let createdCount = 0
		let updatedCount = 0

		for (const item of products) {
			const existing = await ProductModel.findOne({ sku: item.sku })

			if (existing) {
				const updateData: Record<string, unknown> = {
					name: item.name,
					price: item.price,
					stock: item.stock,
					category: item.category,
					description: item.description,
					shortDescription: item.shortDescription || item.description.slice(0, 150),
					active: item.active !== false,
					updatedAt: new Date(),
				}
				if (item.compareAtPrice !== undefined) updateData.compareAtPrice = item.compareAtPrice
				if (item.rating !== undefined) updateData.rating = item.rating
				if (item.isNew !== undefined) updateData.isNew = item.isNew
				if (item.isBestSeller !== undefined) updateData.isBestSeller = item.isBestSeller
				if (item.tone !== undefined) updateData.tone = item.tone
				if (item.variants && item.variants.length > 0) updateData.variants = item.variants
				if (item.images && item.images.length > 0) updateData.images = item.images

				const nameChanged = item.name.trim() !== existing.name.trim()
				const explicitSlug = item.slug ? toSlug(item.slug) : ''
				const hasCustomExplicitSlug = Boolean(
					explicitSlug && explicitSlug !== toSlug(item.name) && explicitSlug !== existing.slug
				)

				if (nameChanged || hasCustomExplicitSlug) {
					const targetBaseSlug = explicitSlug || toSlug(item.name) || 'product'
					const finalSlug = await resolveUniqueSlug(targetBaseSlug, existing.productId)
					updateData.slug = finalSlug
				}

				await ProductModel.updateOne({ productId: existing.productId }, { $set: updateData })
				updatedCount++
			} else {
				const baseSlug = toSlug(item.slug || item.name) || 'product'
				const finalSlug = await resolveUniqueSlug(baseSlug)

				const productId = `prod_${randomUUID().replaceAll('-', '').slice(0, 16)}`
				await ProductModel.create({
					productId,
					name: item.name,
					slug: finalSlug,
					sku: item.sku,
					category: item.category,
					price: item.price,
					compareAtPrice: item.compareAtPrice,
					stock: item.stock,
					shortDescription: item.shortDescription || item.description.slice(0, 150),
					description: item.description,
					images: item.images ?? [],
					variants: item.variants ?? [],
					active: item.active !== false,
					rating: item.rating,
					isNew: item.isNew,
					isBestSeller: item.isBestSeller,
					tone: item.tone,
				})
				createdCount++
			}
		}

		response.json({
			success: true,
			createdCount,
			updatedCount,
			totalProcessed: products.length,
		})
	},
	deleteProduct: async (request: Request, response: Response) => {
		const existing = await ProductModel.findOne({ productId: request.params.productId })
		if (!existing) {
			return response.status(404).json({ success: false, code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' })
		}
		// Delete all associated images from storage before removing the document
		const images = (existing.images ?? []).filter((img): img is string => typeof img === 'string')
		await Promise.all(images.map((img) => storage.delete(img)))
		await ProductModel.deleteOne({ productId: request.params.productId })
		response.json({ success: true, productId: request.params.productId })
	},
} }
export async function updateAdminStock(request: Request, response: Response) { const parsed = adminStockSchema.safeParse(request.body); if (!parsed.success) return response.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Stock must be a non-negative integer.' }); const product = await ProductModel.findOneAndUpdate({ productId: request.params.productId }, { $set: { stock: parsed.data.stock, updatedAt: new Date() } }, { new: true, runValidators: true }); if (!product) return response.status(404).json({ success: false, code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' }); response.json({ success: true, product: { productId: product.productId, stock: product.stock } }) }
