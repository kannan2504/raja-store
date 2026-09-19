import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { ProductModel } from '../src/models/productDocument'
import {
  planSlugMigration,
  executeSlugMigration,
  type ProductSlugInput,
} from '../src/utils/slugMigration'
import { toSlug } from '../src/utils/slug'

describe('Product Slug Migration Logic & Execution', () => {
  describe('Pure Planning Logic (planSlugMigration)', () => {
    it('correctly maps the exact production case: RS-KIT-013 retains vegetable-peeler and RS-KIT-092 becomes vegetable-peeler-2', () => {
      const input: ProductSlugInput[] = [
        {
          productId: 'prod_peeler_13',
          sku: 'RS-KIT-013',
          name: 'Vegetable Peeler',
          slug: 'vegetable-peeler',
        },
        {
          productId: 'prod_peeler_92',
          sku: 'RS-KIT-092',
          name: 'Vegetable Peeler',
          slug: 'vegetable-peeler-rs-kit-092',
        },
        {
          productId: 'prod_scissors_01',
          sku: 'RS-KIT-001',
          name: 'Kitchen Scissors',
          slug: 'brass-dabba-set',
        },
      ]

      const plan = planSlugMigration(input)

      expect(plan.isValid).toBe(true)
      expect(plan.totalChecked).toBe(3)
      expect(plan.alreadyCorrectCount).toBe(1)
      expect(plan.toUpdateCount).toBe(2)
      expect(plan.collisionCount).toBe(1)

      const peeler13 = plan.items.find((i) => i.sku === 'RS-KIT-013')!
      expect(peeler13.proposedSlug).toBe('vegetable-peeler')
      expect(peeler13.action).toBe('KEEP')

      const peeler92 = plan.items.find((i) => i.sku === 'RS-KIT-092')!
      expect(peeler92.proposedSlug).toBe('vegetable-peeler-2')
      expect(peeler92.action).toBe('UPDATE')
      expect(peeler92.collisionResolved).toBe(true)

      const scissors = plan.items.find((i) => i.sku === 'RS-KIT-001')!
      expect(scissors.proposedSlug).toBe('kitchen-scissors')
      expect(scissors.action).toBe('UPDATE')
    })

    it('assigns -2, -3, -4 deterministically when duplicate names exist and none initially owns base slug', () => {
      const input: ProductSlugInput[] = [
        { productId: 'p1', sku: 'SKU-001', name: 'Ceramic Plate', slug: 'old-plate-1' },
        { productId: 'p2', sku: 'SKU-002', name: 'Ceramic Plate', slug: 'old-plate-2' },
        { productId: 'p3', sku: 'SKU-003', name: 'Ceramic Plate', slug: 'old-plate-3' },
      ]

      const plan = planSlugMigration(input)
      expect(plan.isValid).toBe(true)

      const p1 = plan.items.find((i) => i.sku === 'SKU-001')!
      const p2 = plan.items.find((i) => i.sku === 'SKU-002')!
      const p3 = plan.items.find((i) => i.sku === 'SKU-003')!

      expect(p1.proposedSlug).toBe('ceramic-plate')
      expect(p2.proposedSlug).toBe('ceramic-plate-2')
      expect(p3.proposedSlug).toBe('ceramic-plate-3')
    })

    it('validates uniqueness across all proposed slugs and reports invalid plans if errors exist', () => {
      const inputWithMissingName: ProductSlugInput[] = [
        { productId: 'p1', sku: 'SKU-001', name: '', slug: 'some-slug' },
      ]
      const plan = planSlugMigration(inputWithMissingName)
      expect(plan.isValid).toBe(false)
      expect(plan.errors.length).toBeGreaterThan(0)
    })
  })

  describe('MongoDB Migration Execution', () => {
    let mongo: MongoMemoryServer

    beforeAll(async () => {
      try {
        await mongoose.connect('mongodb://127.0.0.1:27017/raja-store-migration-test', {
          serverSelectionTimeoutMS: 2000,
        })
      } catch {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect()
        }
        mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } })
        await mongoose.connect(mongo.getUri())
      }
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

    it('test 1: dry-run does not modify database', async () => {
      await ProductModel.create([
        {
          productId: 'prod_dry_1',
          name: 'Kitchen Scissors',
          slug: 'brass-dabba-set',
          sku: 'RS-KIT-001',
          description: 'Sharp stainless kitchen scissors.',
          shortDescription: 'Kitchen scissors.',
          price: 499,
          stock: 20,
        },
        {
          productId: 'prod_dry_2',
          name: 'Vegetable Peeler',
          slug: 'vegetable-peeler-rs-kit-092',
          sku: 'RS-KIT-092',
          description: 'Ergonomic peeler.',
          shortDescription: 'Peeler.',
          price: 199,
          stock: 15,
        },
      ])

      const raw = await ProductModel.find().lean()
      const plan = planSlugMigration(raw)
      expect(plan.toUpdateCount).toBe(2)

      // Execute in DRY-RUN mode (apply: false)
      const result = await executeSlugMigration(ProductModel, plan, { apply: false })
      expect(result.applied).toBe(false)
      expect(result.updatedCount).toBe(0)

      // Query database directly to confirm zero changes were made
      const inDbAfter = await ProductModel.find().lean()
      const p1 = inDbAfter.find((p) => p.sku === 'RS-KIT-001')!
      const p2 = inDbAfter.find((p) => p.sku === 'RS-KIT-092')!

      expect(p1.slug).toBe('brass-dabba-set')
      expect(p2.slug).toBe('vegetable-peeler-rs-kit-092')
    })

    it('test 2: mismatched slug correction', async () => {
      await ProductModel.create({
        productId: 'prod_mismatch_1',
        name: 'Kitchen Scissors',
        slug: 'brass-dabba-set',
        sku: 'RS-KIT-001',
        description: 'Multi-purpose scissors.',
        shortDescription: 'Scissors.',
        price: 350,
        stock: 12,
      })

      const raw = await ProductModel.find().lean()
      const plan = planSlugMigration(raw)
      expect(plan.toUpdateCount).toBe(1)

      const result = await executeSlugMigration(ProductModel, plan, { apply: true })
      expect(result.applied).toBe(true)
      expect(result.updatedCount).toBe(1)

      const updated = await ProductModel.findOne({ productId: 'prod_mismatch_1' }).lean()
      expect(updated?.slug).toBe('kitchen-scissors')
    })

    it('test 3: already-correct slug preservation', async () => {
      await ProductModel.create({
        productId: 'prod_correct_1',
        name: 'Vegetable Peeler',
        slug: 'vegetable-peeler',
        sku: 'RS-KIT-013',
        description: 'Vegetable peeler.',
        shortDescription: 'Peeler.',
        price: 150,
        stock: 50,
      })

      const raw = await ProductModel.find().lean()
      const plan = planSlugMigration(raw)
      expect(plan.alreadyCorrectCount).toBe(1)
      expect(plan.toUpdateCount).toBe(0)

      const result = await executeSlugMigration(ProductModel, plan, { apply: true })
      expect(result.applied).toBe(true)
      expect(result.updatedCount).toBe(0)

      const unchanged = await ProductModel.findOne({ productId: 'prod_correct_1' }).lean()
      expect(unchanged?.slug).toBe('vegetable-peeler')
    })

    it('test 4: duplicate names produce -2/-3 deterministically', async () => {
      await ProductModel.create([
        {
          productId: 'prod_dup_1',
          name: 'Spice Jar',
          slug: 'spice-jar', // owns base slug
          sku: 'RS-SPI-001',
          description: 'Glass spice jar.',
          shortDescription: 'Spice jar.',
          price: 99,
          stock: 10,
        },
        {
          productId: 'prod_dup_2',
          name: 'Spice Jar',
          slug: 'spice-jar-rs-spi-002', // legacy mismatch
          sku: 'RS-SPI-002',
          description: 'Glass spice jar 2.',
          shortDescription: 'Spice jar.',
          price: 99,
          stock: 10,
        },
        {
          productId: 'prod_dup_3',
          name: 'Spice Jar',
          slug: 'old-random-jar-slug', // legacy mismatch
          sku: 'RS-SPI-003',
          description: 'Glass spice jar 3.',
          shortDescription: 'Spice jar.',
          price: 99,
          stock: 10,
        },
      ])

      const raw = await ProductModel.find().lean()
      const plan = planSlugMigration(raw)

      const result = await executeSlugMigration(ProductModel, plan, { apply: true })
      expect(result.applied).toBe(true)
      expect(result.updatedCount).toBe(2)

      const inDb = await ProductModel.find().sort({ sku: 1 }).lean()
      expect(inDb.find((p) => p.sku === 'RS-SPI-001')?.slug).toBe('spice-jar')
      expect(inDb.find((p) => p.sku === 'RS-SPI-002')?.slug).toBe('spice-jar-2')
      expect(inDb.find((p) => p.sku === 'RS-SPI-003')?.slug).toBe('spice-jar-3')
    })

    it('test 5: all final slugs unique across entire catalog without unique index collision', async () => {
      // Create a complex mixed set of 6 products with swapped slugs and duplicates
      await ProductModel.create([
        {
          productId: 'p_a',
          sku: 'SKU-A',
          name: 'Handwoven Basket',
          slug: 'terracotta-pot', // holds p_b's desired slug!
          description: 'Desc A',
          shortDescription: 'Desc A',
          price: 500,
          stock: 5,
        },
        {
          productId: 'p_b',
          sku: 'SKU-B',
          name: 'Terracotta Pot',
          slug: 'old-pot-slug',
          description: 'Desc B',
          shortDescription: 'Desc B',
          price: 600,
          stock: 8,
        },
        {
          productId: 'p_c',
          sku: 'SKU-C',
          name: 'Handwoven Basket',
          slug: 'basket-legacy-c',
          description: 'Desc C',
          shortDescription: 'Desc C',
          price: 550,
          stock: 4,
        },
        {
          productId: 'p_d',
          sku: 'SKU-D',
          name: 'Handwoven Basket',
          slug: 'basket-legacy-d',
          description: 'Desc D',
          shortDescription: 'Desc D',
          price: 550,
          stock: 4,
        },
      ])

      const raw = await ProductModel.find().lean()
      const plan = planSlugMigration(raw)
      expect(plan.isValid).toBe(true)

      // Execute migration with 2-phase update
      const result = await executeSlugMigration(ProductModel, plan, { apply: true })
      expect(result.applied).toBe(true)
      expect(result.success).toBe(true)

      const allUpdated = await ProductModel.find().lean()
      const allSlugs = allUpdated.map((p) => p.slug)
      const uniqueSlugs = new Set(allSlugs)

      expect(uniqueSlugs.size).toBe(allSlugs.length)
      expect(allSlugs).toContain('terracotta-pot')
      expect(allSlugs).toContain('handwoven-basket')
      expect(allSlugs).toContain('handwoven-basket-2')
      expect(allSlugs).toContain('handwoven-basket-3')
    })

    it('test 6: unrelated product fields remain completely unchanged', async () => {
      const initialDoc = {
        productId: 'prod_full_fields_001',
        sku: 'RS-HOM-999',
        name: 'Handcrafted Wooden Stool',
        slug: 'old-mismatched-slug',
        description: 'Detailed description about teak wood craftsmanship.',
        shortDescription: 'Teak wood stool.',
        price: 1899,
        compareAtPrice: 2499,
        discount: 24,
        stock: 7,
        category: { name: 'Furniture', slug: 'furniture' },
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        variants: [
          {
            id: 'var_1',
            sku: 'RS-HOM-999-NAT',
            label: 'Natural Teak',
            stock: 7,
            options: new Map([['finish', 'natural']]),
          },
        ],
        active: true,
        rating: 4.9,
        isNew: true,
        isBestSeller: true,
        tone: 'warm-wood',
      }

      await ProductModel.create(initialDoc)

      const raw = await ProductModel.find({ productId: 'prod_full_fields_001' }).lean()
      const plan = planSlugMigration(raw)

      const result = await executeSlugMigration(ProductModel, plan, { apply: true })
      expect(result.applied).toBe(true)
      expect(result.updatedCount).toBe(1)

      const after = await ProductModel.findOne({ productId: 'prod_full_fields_001' }).lean()
      expect(after).not.toBeNull()

      // ONLY slug should have changed
      expect(after?.slug).toBe('handcrafted-wooden-stool')

      // All other fields must remain strictly unchanged
      expect(after?.productId).toBe(initialDoc.productId)
      expect(after?.sku).toBe(initialDoc.sku)
      expect(after?.name).toBe(initialDoc.name)
      expect(after?.description).toBe(initialDoc.description)
      expect(after?.shortDescription).toBe(initialDoc.shortDescription)
      expect(after?.price).toBe(initialDoc.price)
      expect(after?.compareAtPrice).toBe(initialDoc.compareAtPrice)
      expect(after?.discount).toBe(initialDoc.discount)
      expect(after?.stock).toBe(initialDoc.stock)
      expect(after?.category?.name).toBe(initialDoc.category.name)
      expect(after?.category?.slug).toBe(initialDoc.category.slug)
      expect(after?.images).toEqual(initialDoc.images)
      expect(after?.variants?.length).toBe(1)
      expect(after?.variants?.[0]?.sku).toBe('RS-HOM-999-NAT')
      expect(after?.active).toBe(initialDoc.active)
      expect(after?.rating).toBe(initialDoc.rating)
      expect(after?.isNew).toBe(initialDoc.isNew)
      expect(after?.isBestSeller).toBe(initialDoc.isBestSeller)
      expect(after?.tone).toBe(initialDoc.tone)
    })
  })
})
