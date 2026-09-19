import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import supertest from 'supertest'
import { makeApp } from '../src/appFactory'
import { MongoProductRepository } from '../src/repositories/mongoProductRepository'
import { MongoOrderRepository } from '../src/repositories/mongoOrderRepository'
import { ProductModel } from '../src/models/productDocument'
import { env } from '../src/config/env'

describe('Temporary Protected Admin Slug Migration Endpoint: POST /api/admin/migrate-product-slugs', () => {
  let mongo: MongoMemoryServer
  let app: ReturnType<typeof makeApp>

  beforeAll(async () => {
    try {
      await mongoose.connect('mongodb://127.0.0.1:27017/raja-store-endpoint-test', {
        serverSelectionTimeoutMS: 2000,
      })
    } catch {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect()
      }
      mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } })
      await mongoose.connect(mongo.getUri())
    }

    const products = new MongoProductRepository()
    const orders = new MongoOrderRepository()
    app = makeApp(products, orders, true, 'mongo')
  }, 60000)

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await ProductModel.deleteMany({})
        await mongoose.disconnect()
      }
    } finally {
      if (mongo) {
        await mongo.stop()
      }
    }
  }, 30000)

  beforeEach(async () => {
    await ProductModel.deleteMany({})
  })

  it('1. Rejects unauthenticated request with 401 ADMIN_UNAUTHORIZED', async () => {
    const res = await supertest(app)
      .post('/api/admin/migrate-product-slugs')
      .send({})

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('ADMIN_UNAUTHORIZED')
  })

  it('2. Rejects request with arbitrary fields in body with 400 VALIDATION_ERROR', async () => {
    const res = await supertest(app)
      .post('/api/admin/migrate-product-slugs')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send({ apply: false, maliciousField: 'arbitrary_data', customSlug: 'hacked' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('3. Authenticated default dry-run request does NOT modify database', async () => {
    await ProductModel.create([
      {
        productId: 'prod_ep_1',
        name: 'Kitchen Scissors',
        slug: 'brass-dabba-set',
        sku: 'RS-KIT-001',
        description: 'Multi-use kitchen scissors.',
        shortDescription: 'Scissors.',
        price: 399,
        stock: 10,
      },
      {
        productId: 'prod_ep_2',
        name: 'Vegetable Peeler',
        slug: 'vegetable-peeler',
        sku: 'RS-KIT-013',
        description: 'Standard peeler.',
        shortDescription: 'Peeler.',
        price: 149,
        stock: 25,
      },
    ])

    const res = await supertest(app)
      .post('/api/admin/migrate-product-slugs')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.applied).toBe(false)
    expect(res.body.totalProductsChecked).toBe(2)
    expect(res.body.numberRequiringChanges).toBe(1)
    expect(res.body.collisionCount).toBe(0)
    expect(res.body.proposedChanges).toHaveLength(1)
    expect(res.body.proposedChanges[0]).toEqual({
      sku: 'RS-KIT-001',
      name: 'Kitchen Scissors',
      oldSlug: 'brass-dabba-set',
      newSlug: 'kitchen-scissors',
    })

    // Verify database is completely untouched
    const inDb = await ProductModel.find().lean()
    expect(inDb.find((p) => p.sku === 'RS-KIT-001')?.slug).toBe('brass-dabba-set')
    expect(inDb.find((p) => p.sku === 'RS-KIT-013')?.slug).toBe('vegetable-peeler')
  })

  it('4. Explicit apply:false does NOT modify database', async () => {
    await ProductModel.create({
      productId: 'prod_ep_3',
      name: 'Ceramic Mug',
      slug: 'old-random-mug',
      sku: 'RS-HOM-005',
      description: 'Handmade mug.',
      shortDescription: 'Mug.',
      price: 299,
      stock: 5,
    })

    const res = await supertest(app)
      .post('/api/admin/migrate-product-slugs')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send({ apply: false })

    expect(res.status).toBe(200)
    expect(res.body.applied).toBe(false)
    expect(res.body.numberRequiringChanges).toBe(1)

    // Confirm DB record slug is unchanged
    const after = await ProductModel.findOne({ sku: 'RS-HOM-005' }).lean()
    expect(after?.slug).toBe('old-random-mug')
  })

  it('5. apply:true performs migration and resolves collisions deterministically', async () => {
    await ProductModel.create([
      {
        productId: 'prod_peeler_13',
        sku: 'RS-KIT-013',
        name: 'Vegetable Peeler',
        slug: 'vegetable-peeler', // already correct
        description: 'Standard peeler.',
        shortDescription: 'Peeler.',
        price: 150,
        stock: 30,
      },
      {
        productId: 'prod_peeler_92',
        sku: 'RS-KIT-092',
        name: 'Vegetable Peeler',
        slug: 'vegetable-peeler-rs-kit-092', // collision with RS-KIT-013
        description: 'Stainless peeler.',
        shortDescription: 'Peeler.',
        price: 199,
        stock: 20,
      },
      {
        productId: 'prod_scissors_1',
        sku: 'RS-KIT-001',
        name: 'Kitchen Scissors',
        slug: 'brass-dabba-set', // mismatch
        description: 'Scissors.',
        shortDescription: 'Scissors.',
        price: 450,
        stock: 12,
      },
    ])

    const res = await supertest(app)
      .post('/api/admin/migrate-product-slugs')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send({ apply: true })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.applied).toBe(true)
    expect(res.body.totalProductsChecked).toBe(3)
    expect(res.body.updatedCount).toBe(2)
    expect(res.body.collisionCount).toBe(1)
    expect(res.body.summary).toBeTruthy()

    // Query database to verify applied changes
    const inDb = await ProductModel.find().lean()
    const peeler13 = inDb.find((p) => p.sku === 'RS-KIT-013')!
    const peeler92 = inDb.find((p) => p.sku === 'RS-KIT-092')!
    const scissors = inDb.find((p) => p.sku === 'RS-KIT-001')!

    // RS-KIT-013 retained vegetable-peeler
    expect(peeler13.slug).toBe('vegetable-peeler')
    // RS-KIT-092 resolved collision to vegetable-peeler-2
    expect(peeler92.slug).toBe('vegetable-peeler-2')
    // RS-KIT-001 updated to kitchen-scissors
    expect(scissors.slug).toBe('kitchen-scissors')
  })

  it('6. Unrelated product fields remain strictly unchanged after apply:true', async () => {
    const fullProduct = {
      productId: 'prod_immutable_check',
      sku: 'RS-TEST-IMMUTABLE',
      name: 'Handcrafted Wooden Stool',
      slug: 'old-mismatched-slug',
      description: 'Solid teak stool with oil finish.',
      shortDescription: 'Teak stool.',
      price: 2499,
      compareAtPrice: 2999,
      discount: 16,
      stock: 8,
      category: { name: 'Furniture', slug: 'furniture' },
      images: ['https://example.com/stool1.jpg', 'https://example.com/stool2.jpg'],
      variants: [
        {
          id: 'var_stool_natural',
          sku: 'RS-TEST-IMMUTABLE-NAT',
          label: 'Natural Finish',
          stock: 8,
          options: new Map([['color', 'natural']]),
        },
      ],
      active: true,
      rating: 4.8,
      isNew: true,
      isBestSeller: true,
      tone: 'teak',
    }

    await ProductModel.create(fullProduct)

    const res = await supertest(app)
      .post('/api/admin/migrate-product-slugs')
      .set('Authorization', `Bearer ${env.ADMIN_API_TOKEN}`)
      .send({ apply: true })

    expect(res.status).toBe(200)
    expect(res.body.applied).toBe(true)

    const updated = await ProductModel.findOne({ productId: 'prod_immutable_check' }).lean()
    expect(updated).not.toBeNull()

    // Slug is corrected
    expect(updated?.slug).toBe('handcrafted-wooden-stool')

    // All other fields remain 100% untouched
    expect(updated?.productId).toBe(fullProduct.productId)
    expect(updated?.sku).toBe(fullProduct.sku)
    expect(updated?.name).toBe(fullProduct.name)
    expect(updated?.description).toBe(fullProduct.description)
    expect(updated?.shortDescription).toBe(fullProduct.shortDescription)
    expect(updated?.price).toBe(fullProduct.price)
    expect(updated?.compareAtPrice).toBe(fullProduct.compareAtPrice)
    expect(updated?.discount).toBe(fullProduct.discount)
    expect(updated?.stock).toBe(fullProduct.stock)
    expect(updated?.category?.name).toBe(fullProduct.category.name)
    expect(updated?.category?.slug).toBe(fullProduct.category.slug)
    expect(updated?.images).toEqual(fullProduct.images)
    expect(updated?.variants?.length).toBe(1)
    expect(updated?.variants?.[0]?.sku).toBe('RS-TEST-IMMUTABLE-NAT')
    expect(updated?.active).toBe(fullProduct.active)
    expect(updated?.rating).toBe(fullProduct.rating)
    expect(updated?.isNew).toBe(fullProduct.isNew)
    expect(updated?.isBestSeller).toBe(fullProduct.isBestSeller)
    expect(updated?.tone).toBe(fullProduct.tone)
  })
})
