import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import supertest from 'supertest'
import { makeApp } from '../src/appFactory'
import { MongoProductRepository } from '../src/repositories/mongoProductRepository'
import { MongoOrderRepository } from '../src/repositories/mongoOrderRepository'
import { ProductModel } from '../src/models/productDocument'
import { env } from '../src/config/env'

let mongo: MongoMemoryServer
let app: ReturnType<typeof makeApp>
const validPngBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])

beforeAll(async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/raja-store-test', { serverSelectionTimeoutMS: 2000 })
  } catch {
    mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } })
    await mongoose.connect(mongo.getUri())
  }
  const products = new MongoProductRepository()
  const orders = new MongoOrderRepository()
  app = makeApp(products, orders, true, 'mongo')
}, 60000)

afterAll(async () => {
  await ProductModel.deleteMany({ sku: { $in: ['RS-VASE-001', 'S', 'RS-BULK-TEA01', 'RS-BULK-MUG01'] } })
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
})

describe('Admin Product Add/Edit Flow', () => {
  let createdProductId = ''
  let initialImageReference = ''

  it('Test 1: Add a completely new product + 1 image', async () => {
    const newProductPayload = {
      name: 'Handcrafted Ceramic Vase',
      slug: 'handcrafted-ceramic-vase',
      description: 'A beautifully sculpted earthen ceramic vase.',
      shortDescription: 'Ceramic flower vase.',
      sku: 'RS-VASE-001',
      category: { name: 'Home Decor', slug: 'home-decor' },
      price: 1299,
      compareAtPrice: 1599,
      stock: 15,
      active: true
    }

    const response = await supertest(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .field('product', JSON.stringify(newProductPayload))
      .field('imageOrder', JSON.stringify(['file:0']))
      .attach('images', validPngBuffer, 'vase.png')

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.product.name).toBe('Handcrafted Ceramic Vase')
    expect(response.body.product.sku).toBe('RS-VASE-001')
    expect(response.body.product.price).toBe(1299)
    expect(response.body.product.stock).toBe(15)
    expect(response.body.product.images).toHaveLength(1)

    createdProductId = response.body.product.productId
    initialImageReference = response.body.product.images[0]
    expect(initialImageReference).toMatch(/^[0-9a-f-]{36}\.png$/i)

    // Verify persisted in MongoDB
    const persisted = await ProductModel.findOne({ productId: createdProductId })
    expect(persisted).not.toBeNull()
    expect(persisted?.images).toEqual([initialImageReference])
  })

  it('Test 2: Edit an existing product without changing its images', async () => {
    const editPayload = {
      name: 'Handcrafted Ceramic Vase - Updated',
      slug: 'handcrafted-ceramic-vase',
      description: 'Updated description for the vase.',
      shortDescription: 'Updated vase description.',
      sku: 'RS-VASE-001',
      category: { name: 'Home Decor', slug: 'home-decor' },
      price: 1399,
      compareAtPrice: 1699,
      stock: 20,
      active: true
    }

    const response = await supertest(app)
      .patch(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .field('product', JSON.stringify(editPayload))
      .field('imageOrder', JSON.stringify([`ref:${initialImageReference}`]))

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.product.name).toBe('Handcrafted Ceramic Vase - Updated')
    expect(response.body.product.price).toBe(1399)
    expect(response.body.product.stock).toBe(20)
    // Existing image reference remains valid
    expect(response.body.product.images).toEqual([initialImageReference])

    const persisted = await ProductModel.findOne({ productId: createdProductId })
    expect(persisted?.price).toBe(1399)
    expect(persisted?.stock).toBe(20)
    expect(persisted?.images).toEqual([initialImageReference])
  })

  it('Test 3: Edit an existing product and add another image', async () => {
    const editPayload = {
      name: 'Handcrafted Ceramic Vase - Updated With 2 Images',
      slug: 'handcrafted-ceramic-vase',
      description: 'Now with two detailed photos.',
      shortDescription: 'Updated with 2 images.',
      sku: 'RS-VASE-001',
      category: { name: 'Home Decor', slug: 'home-decor' },
      price: 1499,
      stock: 18,
      active: true
    }

    // Retain initialImageReference as ref:..., and attach a second file as file:0
    const response = await supertest(app)
      .patch(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .field('product', JSON.stringify(editPayload))
      .field('imageOrder', JSON.stringify([`ref:${initialImageReference}`, 'file:0']))
      .attach('images', validJpegBuffer, 'vase_detail.jpg')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.product.images).toHaveLength(2)
    expect(response.body.product.images[0]).toBe(initialImageReference)
    expect(response.body.product.images[1]).toMatch(/^[0-9a-f-]{36}\.jpg$/i)

    const persisted = await ProductModel.findOne({ productId: createdProductId })
    expect(persisted?.images).toHaveLength(2)
    expect(persisted?.images[0]).toBe(initialImageReference)
  })

  it('Surfaces backend validation errors cleanly instead of generic error', async () => {
    const invalidPayload = {
      name: 'A', // too short (< 2 chars)
      slug: 'INVALID SLUG WITH SPACES',
      description: '',
      shortDescription: '',
      sku: 'S',
      category: { name: '', slug: '' },
      price: -50,
      stock: -5
    }

    const response = await supertest(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .field('product', JSON.stringify(invalidPayload))
      .field('imageOrder', JSON.stringify(['file:0']))
      .attach('images', validPngBuffer, 'test.png')

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.code).toBe('VALIDATION_ERROR')
    expect(response.body.message).not.toBe('Please check the product details.')
    // Should clearly mention specific field errors
    expect(response.body.message).toMatch(/(name|slug|price|stock|sku)/)
  })
})

describe('Admin Bulk Product Import Flow', () => {
  let bulkUploadedImageRef = ''

  it('Requires admin authentication for bulk endpoints', async () => {
    const uploadRes = await supertest(app)
      .post('/api/admin/products/bulk-upload-image')
      .attach('images', validJpegBuffer, 'tea.jpg')
    expect(uploadRes.status).toBe(401)

    const importRes = await supertest(app)
      .post('/api/admin/products/bulk-import')
      .send({ products: [] })
    expect(importRes.status).toBe(401)
  })

  it('Validates bulk photo uploads (rejects empty or invalid formats, accepts valid)', async () => {
    // 1. Zero files
    const emptyRes = await supertest(app)
      .post('/api/admin/products/bulk-upload-image')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
    expect(emptyRes.status).toBe(400)
    expect(emptyRes.body.code).toBe('NO_FILES')

    // 2. Invalid file (plain text instead of image)
    const invalidRes = await supertest(app)
      .post('/api/admin/products/bulk-upload-image')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .attach('images', Buffer.from('NOT AN IMAGE'), 'test.txt')
    expect(invalidRes.status).toBe(400)
    expect(invalidRes.body.code).toBe('UPLOAD_FAILED')

    // 3. Valid image file
    const validRes = await supertest(app)
      .post('/api/admin/products/bulk-upload-image')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .attach('images', validJpegBuffer, 'RS-BULK-TEA01.jpg')
    expect(validRes.status).toBe(200)
    expect(validRes.body.success).toBe(true)
    expect(validRes.body.uploaded).toHaveLength(1)
    expect(validRes.body.uploaded[0].filename).toBe('RS-BULK-TEA01.jpg')
    expect(validRes.body.uploaded[0].reference).toBeTruthy()

    bulkUploadedImageRef = validRes.body.uploaded[0].reference
  })

  it('Rejects bulk import payload with duplicate SKUs in the same batch', async () => {
    const duplicatePayload = {
      products: [
        {
          sku: 'RS-BULK-TEA01',
          name: 'Tea Strainer 1',
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 89,
          stock: 20,
          description: 'A test tea strainer item.',
          images: [],
        },
        {
          sku: 'RS-BULK-TEA01',
          name: 'Tea Strainer Duplicate',
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 99,
          stock: 10,
          description: 'A duplicate tea strainer item.',
          images: [],
        },
      ],
    }

    const response = await supertest(app)
      .post('/api/admin/products/bulk-import')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send(duplicatePayload)

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('DUPLICATE_SKU_IN_PAYLOAD')
  })

  it('Rejects bulk import with invalid numbers (e.g. negative price or negative stock)', async () => {
    const invalidPayload = {
      products: [
        {
          sku: 'RS-BULK-INVALID',
          name: 'Invalid Price Product',
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: -25,
          stock: 10,
          description: 'Invalid price.',
          images: [],
        },
      ],
    }

    const response = await supertest(app)
      .post('/api/admin/products/bulk-import')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send(invalidPayload)

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('VALIDATION_ERROR')
  })

  it('Creates new products in bulk and updates existing products by SKU without duplicates', async () => {
    // 1. Initial import of 2 products
    const initialPayload = {
      products: [
        {
          sku: 'RS-BULK-TEA01',
          name: 'Stainless Steel Tea Filter',
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 89,
          compareAtPrice: 120,
          stock: 50,
          shortDescription: 'Fine double-mesh stainless steel strainer.',
          description: 'Durable food-grade stainless steel tea filter.',
          images: [bulkUploadedImageRef],
          active: true,
          tone: 'mustard',
        },
        {
          sku: 'RS-BULK-MUG01',
          name: 'Heavy Duty Plastic Bath Mug',
          category: { name: 'Everyday', slug: 'everyday' },
          price: 49,
          compareAtPrice: 75,
          stock: 80,
          shortDescription: '1-litre ribbed plastic mug.',
          description: 'Made of virgin unbreakable polypropylene plastic.',
          images: [],
          active: true,
          tone: 'terracotta',
        },
      ],
    }

    const createRes = await supertest(app)
      .post('/api/admin/products/bulk-import')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send(initialPayload)

    expect(createRes.status).toBe(200)
    expect(createRes.body.success).toBe(true)
    expect(createRes.body.createdCount).toBe(2)
    expect(createRes.body.updatedCount).toBe(0)

    // Verify in MongoDB
    const teaProd = await ProductModel.findOne({ sku: 'RS-BULK-TEA01' })
    expect(teaProd).not.toBeNull()
    expect(teaProd?.name).toBe('Stainless Steel Tea Filter')
    expect(teaProd?.price).toBe(89)
    expect(teaProd?.stock).toBe(50)
    expect(teaProd?.slug).toBe('stainless-steel-tea-filter')
    expect(teaProd?.images).toEqual([bulkUploadedImageRef])

    const mugProd = await ProductModel.findOne({ sku: 'RS-BULK-MUG01' })
    expect(mugProd).not.toBeNull()
    expect(mugProd?.price).toBe(49)
    expect(mugProd?.stock).toBe(80)

    // 2. Re-import: update RS-BULK-TEA01 price/stock and preserve its images
    const updatePayload = {
      products: [
        {
          sku: 'RS-BULK-TEA01',
          name: 'Stainless Steel Tea Filter - Updated',
          category: { name: 'Kitchen', slug: 'kitchen' },
          price: 99,
          stock: 45,
          description: 'Durable food-grade stainless steel tea filter with updated price.',
          images: [], // No new images provided, should preserve existing images
          active: true,
        },
      ],
    }

    const updateRes = await supertest(app)
      .post('/api/admin/products/bulk-import')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send(updatePayload)

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.success).toBe(true)
    expect(updateRes.body.createdCount).toBe(0)
    expect(updateRes.body.updatedCount).toBe(1)

    // Verify MongoDB: updated price/stock, preserved existing image
    const updatedTea = await ProductModel.findOne({ sku: 'RS-BULK-TEA01' })
    expect(updatedTea?.price).toBe(99)
    expect(updatedTea?.stock).toBe(45)
    expect(updatedTea?.name).toBe('Stainless Steel Tea Filter - Updated')
    expect(updatedTea?.images).toEqual([bulkUploadedImageRef])
  }, 30000)
})

