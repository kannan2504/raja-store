import { describe, expect, it } from 'vitest'
import {
  parseCsv,
  getSkuFileMatch,
  validateAndMatchBulkProducts,
} from '../../src/utils/bulkProductImport'

describe('Bulk Product Import Client Utilities', () => {
  it('parses CSV with quotes, commas, and line endings', () => {
    const csv = `sku,name,category,price,stock,description
RS-KIT-TEA01,"Stainless Steel Tea Filter, Fine Mesh",Kitchen,89,50,"A durable, fine-mesh strainer."
RS-BAT-MUG01,Plastic Mug,Everyday,49,80,"1-litre plastic mug with ""comfort"" grip."`

    const rows = parseCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0].sku).toBe('RS-KIT-TEA01')
    expect(rows[0].name).toBe('Stainless Steel Tea Filter, Fine Mesh')
    expect(rows[0].description).toBe('A durable, fine-mesh strainer.')
    expect(rows[1].description).toBe('1-litre plastic mug with "comfort" grip.')
  })

  it('matches photo filenames by SKU case-insensitively and handles gallery suffixes', () => {
    const skus = ['RS-KIT-TEA01', 'RS-BAT-MUG01']

    // Exact match
    expect(getSkuFileMatch('RS-KIT-TEA01.jpg', skus)).toEqual({ sku: 'RS-KIT-TEA01', priority: 0 })
    expect(getSkuFileMatch('rs-kit-tea01.png', skus)).toEqual({ sku: 'RS-KIT-TEA01', priority: 0 })
    expect(getSkuFileMatch('RS-KIT-TEA01.WEBP', skus)).toEqual({ sku: 'RS-KIT-TEA01', priority: 0 })

    // Gallery index match (-1, -2, _1, _2)
    expect(getSkuFileMatch('RS-KIT-TEA01-1.jpg', skus)).toEqual({ sku: 'RS-KIT-TEA01', priority: 1 })
    expect(getSkuFileMatch('rs-kit-tea01-2.jpeg', skus)).toEqual({ sku: 'RS-KIT-TEA01', priority: 2 })
    expect(getSkuFileMatch('RS-KIT-TEA01_3.jpg', skus)).toEqual({ sku: 'RS-KIT-TEA01', priority: 3 })

    // Unmatched file
    expect(getSkuFileMatch('UNRELATED-PHOTO.jpg', skus)).toBeNull()
    expect(getSkuFileMatch('RS-KIT-TEA01.pdf', skus)).toBeNull()
  })

  it('validates products, detects missing photos for new products, and flags unmatched photos', () => {
    const rawRows = [
      {
        sku: 'RS-KIT-TEA01',
        name: 'Stainless Steel Tea Filter',
        category: 'Kitchen',
        price: '89',
        stock: '50',
        description: 'Durable tea filter.',
      },
      {
        sku: 'RS-BAT-MUG01',
        name: 'Plastic Bath Mug',
        category: 'Everyday',
        price: '49',
        stock: '80',
        description: 'Ribbed plastic mug.',
      },
      {
        sku: 'RS-ERR-01',
        name: 'Bad Product',
        category: 'Kitchen',
        price: '-10', // invalid price
        stock: '2.5', // non-integer stock
        description: '', // missing description
      },
    ]

    // Simulate photo files
    const mockTeaFile1 = new File([''], 'RS-KIT-TEA01.jpg', { type: 'image/jpeg' })
    const mockTeaFile2 = new File([''], 'rs-kit-tea01-2.jpg', { type: 'image/jpeg' })
    const mockOrphanFile = new File([''], 'UNKNOWN-SKU.png', { type: 'image/png' })

    const report = validateAndMatchBulkProducts(
      rawRows,
      [mockTeaFile1, mockTeaFile2, mockOrphanFile],
      []
    )

    expect(report.products).toHaveLength(3)

    // First product: has 2 matched photos, valid
    expect(report.products[0].matchedFiles).toHaveLength(2)
    expect(report.products[0].errors).toHaveLength(0)

    // Second product: new product but missing photo -> error
    expect(report.products[1].matchedFiles).toHaveLength(0)
    expect(report.products[1].errors).toContain(
      'New product requires at least 1 photo (e.g. RS-BAT-MUG01.jpg).'
    )

    // Third product: multiple field errors
    expect(report.products[2].errors.length).toBeGreaterThanOrEqual(3)

    // Unmatched file detected
    expect(report.unmatchedFiles).toContain('UNKNOWN-SKU.png')

    // Cannot import due to errors
    expect(report.canImport).toBe(false)
  })

  it('derives slug from product name when slug column is omitted, and preserves explicit slug when provided', () => {
    const rawRows = [
      {
        sku: 'RS-AUTO-01',
        name: 'Brass Spice Container Set',
        category: 'Kitchen',
        price: '499',
        stock: '10',
        description: 'Traditional container set.',
        // No slug column provided
      },
      {
        sku: 'RS-EXP-02',
        name: 'Handwoven Cotton Throw',
        slug: 'custom-cotton-throw',
        category: 'Home',
        price: '799',
        stock: '15',
        description: 'Cotton throw blanket.',
      },
    ]

    const report = validateAndMatchBulkProducts(rawRows, [], [])
    expect(report.products).toHaveLength(2)

    // Derived from name
    expect(report.products[0].slug).toBe('brass-spice-container-set')

    // Preserved explicit slug
    expect(report.products[1].slug).toBe('custom-cotton-throw')
  })
})
