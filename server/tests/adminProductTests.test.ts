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
  await ProductModel.deleteMany({ sku: { $in: ['RS-VASE-001', 'S'] } })
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
