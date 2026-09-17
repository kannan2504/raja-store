import { describe, expect, it, vi } from 'vitest'
import supertest from 'supertest'
import { v2 as cloudinary } from 'cloudinary'
import {
  CloudinaryProductImageStorage,
  createProductImageStorage,
  isCloudinaryConfigured,
  isValidProductImageReference,
  LocalProductImageStorage,
  serializeProductImage,
  validateProductImageFile,
} from '../src/services/productImageStorage'
import { makeApp } from '../src/appFactory'
import { InMemoryOrderRepository } from '../src/repositories/orderRepository'
import { InMemoryProductRepository } from '../src/repositories/productRepository'
import { MongoProductRepository } from '../src/repositories/mongoProductRepository'
import { ProductModel } from '../src/models/productDocument'
import { env } from '../src/config/env'

const validPngBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])

describe('Cloudinary & Product Image Storage Unit Tests', () => {
  it('validates image files properly', () => {
    expect(() =>
      validateProductImageFile({
        originalname: 'test.png',
        mimetype: 'image/png',
        size: validPngBuffer.length,
        buffer: validPngBuffer,
      }),
    ).not.toThrow()

    // Exceeds max image size (5 MB)
    expect(() =>
      validateProductImageFile({
        originalname: 'large.png',
        mimetype: 'image/png',
        size: 6 * 1024 * 1024,
        buffer: validPngBuffer,
      }),
    ).toThrowError(/5 MB or smaller/)

    // Invalid extension/MIME
    expect(() =>
      validateProductImageFile({
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 10,
        buffer: Buffer.from('hello world'),
      }),
    ).toThrowError(/valid JPG, JPEG, PNG, or WEBP/)
  })

  it('recognizes valid product image references', () => {
    // Legacy local UUID
    expect(isValidProductImageReference('12345678-1234-1234-1234-123456789abc.png')).toBe(true)
    expect(isValidProductImageReference('00000000-0000-0000-0000-000000000000.jpg')).toBe(true)
    expect(isValidProductImageReference('abcdefab-cdef-abcd-efab-cdefabcdefab.webp')).toBe(true)

    // Cloudinary references
    expect(isValidProductImageReference('cloudinary:raja-store/products/a1b2c3d4')).toBe(true)
    expect(isValidProductImageReference('cloudinary:raja-store/products/sample_img-99')).toBe(true)

    // Full URLs
    expect(isValidProductImageReference('https://res.cloudinary.com/demo/image/upload/sample.jpg')).toBe(true)

    // Invalid references
    expect(isValidProductImageReference('')).toBe(false)
    expect(isValidProductImageReference('invalid-reference')).toBe(false)
    expect(isValidProductImageReference('cloudinary:')).toBe(false)
    expect(isValidProductImageReference(null)).toBe(false)
  })

  it('serializes image references correctly for catalog display', () => {
    // Cloudinary reference -> HTTPS CDN URL
    expect(
      serializeProductImage('cloudinary:raja-store/products/a1b2c3d4', 'prod_123', 'testcloud'),
    ).toBe('https://res.cloudinary.com/testcloud/image/upload/raja-store/products/a1b2c3d4')

    // Legacy local reference -> local image route
    expect(
      serializeProductImage('12345678-1234-1234-1234-123456789abc.png', 'prod_123', 'testcloud'),
    ).toBe('/api/products/prod_123/images/12345678-1234-1234-1234-123456789abc.png')

    // Absolute URL -> returned unchanged
    expect(
      serializeProductImage('https://example.com/photo.jpg', 'prod_123', 'testcloud'),
    ).toBe('https://example.com/photo.jpg')
  })

  it('falls back to LocalProductImageStorage when credentials are absent', () => {
    expect(isCloudinaryConfigured({ CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' })).toBe(false)
    expect(isCloudinaryConfigured({ CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' })).toBe(false)

    const fallbackStorage = createProductImageStorage({
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    })
    expect(fallbackStorage).toBeInstanceOf(LocalProductImageStorage)
  })

  it('instantiates CloudinaryProductImageStorage when credentials are fully configured', () => {
    const config = {
      CLOUDINARY_CLOUD_NAME: 'my-cloud',
      CLOUDINARY_API_KEY: '1234567890',
      CLOUDINARY_API_SECRET: 'secret_key',
    }
    expect(isCloudinaryConfigured(config)).toBe(true)

    const storage = createProductImageStorage(config)
    expect(storage).toBeInstanceOf(CloudinaryProductImageStorage)
  })

  it('CloudinaryProductImageStorage upload, get, and delete methods', async () => {
    const storage = new CloudinaryProductImageStorage({
      cloudName: 'test-cloud',
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
    })

    // Mock upload_stream
    const mockUploadStream = vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
      (_options: any, callback?: any) => {
        const streamMock = {
          end: (_buf: Buffer) => {
            if (callback) {
              callback(null, {
                public_id: 'raja-store/products/mocked-upload-id',
                secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/raja-store/products/mocked-upload-id',
              })
            }
          },
        }
        return streamMock as any
      },
    )

    const reference = await storage.upload({
      originalname: 'test.png',
      mimetype: 'image/png',
      size: validPngBuffer.length,
      buffer: validPngBuffer,
    })

    expect(reference).toBe('cloudinary:raja-store/products/mocked-upload-id')
    expect(mockUploadStream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'raja-store/products', resource_type: 'image' }),
      expect.any(Function),
    )

    // Get returns redirectUrl
    const getResult = storage.get('cloudinary:raja-store/products/mocked-upload-id')
    expect(getResult.redirectUrl).toBe('https://res.cloudinary.com/test-cloud/image/upload/raja-store/products/mocked-upload-id')

    // Delete calls destroy with public_id
    const mockDestroy = vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' })
    await storage.delete('cloudinary:raja-store/products/mocked-upload-id')
    expect(mockDestroy).toHaveBeenCalledWith('raja-store/products/mocked-upload-id', {
      resource_type: 'image',
      invalidate: true,
    })
  })
})

describe('Image Route & Controller Redirection & CORP', () => {
  it('redirects Cloudinary references to secure HTTPS URL with CORP header', async () => {
    const customStorage = new CloudinaryProductImageStorage({
      cloudName: 'raja-cloud',
      apiKey: 'k1',
      apiSecret: 's1',
    })

    const app = makeApp(
      new InMemoryProductRepository(),
      new InMemoryOrderRepository(),
      false,
      'memory',
      customStorage,
    )

    const response = await supertest(app)
      .get('/api/products/prod_123/images/cloudinary:raja-store/products/my-photo-456')

    expect(response.status).toBe(302)
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(response.headers['location']).toBe(
      'https://res.cloudinary.com/raja-cloud/image/upload/raja-store/products/my-photo-456',
    )
  })

  it('preserves Cross-Origin-Resource-Policy for legacy non-existent image 404', async () => {
    const app = makeApp(
      new InMemoryProductRepository(),
      new InMemoryOrderRepository(),
      false,
      'memory',
    )

    const response = await supertest(app)
      .get('/api/products/prod_123/images/00000000-0000-0000-0000-000000000000.png')

    expect(response.status).toBe(404)
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })
})

describe('Catalog Mongo Repository Cloudinary Image Serialization', () => {
  it('serializes cloudinary images to CDN URLs when fetching catalog products', async () => {
    const mockProduct = {
      productId: 'prod_cloud_test_1',
      name: 'Test Cloud Product',
      slug: 'test-cloud-product',
      description: 'Desc',
      shortDescription: 'Short',
      sku: 'RS-TEST-CLOUD',
      price: 500,
      stock: 10,
      active: true,
      images: [
        'cloudinary:raja-store/products/prod-image-1',
        '00000000-0000-0000-0000-000000000000.png',
      ],
      variants: [],
      category: { slug: 'home', name: 'Home' },
    }

    vi.spyOn(ProductModel, 'find').mockReturnValue({
      sort: () => ({
        lean: async () => [mockProduct],
      }),
    } as any)

    const repo = new MongoProductRepository()
    const catalog = await repo.getCatalogProducts()

    expect(catalog).toHaveLength(1)
    const images = catalog[0].images
    expect(images).toHaveLength(2)
    // Cloudinary reference is converted to HTTPS URL (or local if cloudName empty)
    if (env.CLOUDINARY_CLOUD_NAME?.trim()) {
      expect(images[0]).toBe(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME.trim()}/image/upload/raja-store/products/prod-image-1`)
    } else {
      expect(images[0]).toBe('/api/products/prod_cloud_test_1/images/cloudinary:raja-store/products/prod-image-1')
    }
    // Legacy reference remains local image endpoint
    expect(images[1]).toBe('/api/products/prod_cloud_test_1/images/00000000-0000-0000-0000-000000000000.png')
  })
})
