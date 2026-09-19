/* ==========================================================================
   BULK PRODUCT IMPORT UTILITY
   Provides CSV parsing, SKU-based photo matching, and pre-import validation.
   ========================================================================== */

import { type AdminProduct } from '../services/adminService'

export type ParsedBulkRow = {
  rowNumber: number
  sku: string
  name: string
  categoryName: string
  categorySlug: string
  price: number
  compareAtPrice?: number
  stock: number
  shortDescription: string
  description: string
  active: boolean
  isBestSeller: boolean
  isNew: boolean
  tone?: string
  slug?: string
  matchedFiles: File[]
  errors: string[]
  isExisting: boolean
}

export type BulkValidationReport = {
  products: ParsedBulkRow[]
  unmatchedFiles: string[]
  totalPhotosMatched: number
  totalErrors: number
  canImport: boolean
}

/** URL-safe slug helper matching backend validation. */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Standard single-pass RFC 4180 CSV parser.
 * Correctly handles commas inside quotes, escaped quotes (""), CRLF/LF line endings, and BOM.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rowsOfCells: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++
      currentRow.push(currentCell.trim())
      currentCell = ''
      if (currentRow.some((c) => c !== '')) {
        rowsOfCells.push(currentRow)
      }
      currentRow = []
    } else {
      currentCell += char
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some((c) => c !== '')) {
      rowsOfCells.push(currentRow)
    }
  }

  if (rowsOfCells.length < 2) return []

  const headers = rowsOfCells[0].map((h) =>
    h.toLowerCase().trim().replace(/^[\uFEFF]/, '')
  )

  const rows: Record<string, string>[] = []
  for (let r = 1; r < rowsOfCells.length; r++) {
    const cells = rowsOfCells[r]
    if (cells.every((c) => c === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? ''
    })
    rows.push(row)
  }

  return rows
}

/**
 * Matches a file by name to a list of SKUs.
 * Supports <SKU>.<ext>, <SKU>-1.<ext>, <SKU>-2.<ext>, <SKU>_1.<ext>, case-insensitive.
 */
export function getSkuFileMatch(
  fileName: string,
  skus: string[]
): { sku: string; priority: number } | null {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) return null
  const ext = fileName.slice(lastDot + 1).toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return null

  const stem = fileName.slice(0, lastDot).toLowerCase()

  // Sort SKUs by length descending so longer matching SKUs take precedence
  const sortedSkus = [...skus].sort((a, b) => b.length - a.length)

  for (const sku of sortedSkus) {
    const lowerSku = sku.toLowerCase()
    if (stem === lowerSku) {
      return { sku, priority: 0 }
    }
    const dashPrefix = lowerSku + '-'
    const underPrefix = lowerSku + '_'
    if (stem.startsWith(dashPrefix) || stem.startsWith(underPrefix)) {
      const remainder = stem.startsWith(dashPrefix)
        ? stem.slice(dashPrefix.length)
        : stem.slice(underPrefix.length)
      const num = parseInt(remainder, 10)
      const priority = Number.isFinite(num) ? num : 99
      return { sku, priority }
    }
  }
  return null
}

/**
 * Validates parsed CSV rows and associates matched photo files with each product.
 */
export function validateAndMatchBulkProducts(
  rawRows: Record<string, string>[],
  files: File[],
  existingProducts: AdminProduct[]
): BulkValidationReport {
  const existingSkuMap = new Map<string, AdminProduct>()
  for (const p of existingProducts) {
    existingSkuMap.set(p.sku.toLowerCase(), p)
  }

  const skusInCsv = rawRows.map((r) => (r.sku ?? '').trim()).filter(Boolean)
  const skuCounts = new Map<string, number>()
  for (const s of skusInCsv) {
    const lower = s.toLowerCase()
    skuCounts.set(lower, (skuCounts.get(lower) ?? 0) + 1)
  }

  // Group files by SKU
  const matchedFilesBySku = new Map<string, Array<{ file: File; priority: number }>>()
  const unmatchedFiles: string[] = []

  for (const file of files) {
    // Max file size check
    if (file.size > 5 * 1024 * 1024) {
      unmatchedFiles.push(`${file.name} (exceeds 5 MB limit)`)
      continue
    }

    const match = getSkuFileMatch(file.name, skusInCsv)
    if (match) {
      const list = matchedFilesBySku.get(match.sku.toLowerCase()) ?? []
      list.push({ file, priority: match.priority })
      matchedFilesBySku.set(match.sku.toLowerCase(), list)
    } else {
      unmatchedFiles.push(file.name)
    }
  }

  let totalPhotosMatched = 0
  let totalErrors = 0
  const products: ParsedBulkRow[] = []

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2 // 1-indexed including header
    const errors: string[] = []

    const sku = (row.sku ?? '').trim()
    const name = (row.name ?? '').trim()
    const categoryRaw = (row.category ?? '').trim()
    const priceRaw = (row.price ?? '').trim()
    const compareAtRaw = (row.compareatprice ?? row['compare at price'] ?? '').trim()
    const stockRaw = (row.stock ?? '').trim()
    const shortDesc = (row.shortdescription ?? row['short description'] ?? '').trim()
    const desc = (row.description ?? '').trim()
    const activeRaw = (row.active ?? 'true').trim().toLowerCase()
    const isBestSellerRaw = (row.isbestseller ?? row['is best seller'] ?? 'false').trim().toLowerCase()
    const isNewRaw = (row.isnew ?? row['is new'] ?? 'false').trim().toLowerCase()
    const tone = (row.tone ?? '').trim() || undefined
    const slugRaw = (row.slug ?? '').trim()

    // Validation 1: SKU
    if (!sku || sku.length < 2) {
      errors.push('SKU is required (minimum 2 characters).')
    } else if ((skuCounts.get(sku.toLowerCase()) ?? 0) > 1) {
      errors.push(`Duplicate SKU "${sku}" found multiple times in this CSV.`)
    }

    // Validation 2: Name
    if (!name || name.length < 2) {
      errors.push('Product name is required (minimum 2 characters).')
    }

    // Validation 3: Category
    if (!categoryRaw) {
      errors.push('Category is required.')
    }
    const categoryName = categoryRaw || 'Everyday'
    const categorySlug = toSlug(categoryName) || 'everyday'

    // Validation 4: Price
    const priceNum = Number(priceRaw)
    if (!priceRaw || Number.isNaN(priceNum) || priceNum < 0) {
      errors.push('Price must be a valid positive number.')
    }

    // Validation 5: Compare At Price (optional)
    let compareAtPriceNum: number | undefined
    if (compareAtRaw) {
      compareAtPriceNum = Number(compareAtRaw)
      if (Number.isNaN(compareAtPriceNum) || compareAtPriceNum < 0) {
        errors.push('Compare at price must be a valid positive number.')
      }
    }

    // Validation 6: Stock
    const stockNum = Number(stockRaw)
    if (!stockRaw || Number.isNaN(stockNum) || stockNum < 0 || !Number.isInteger(stockNum)) {
      errors.push('Stock must be a non-negative integer.')
    }

    // Validation 7: Description
    if (!desc) {
      errors.push('Description is required.')
    }
    const finalShortDesc = shortDesc || (desc.includes('.') ? desc.split('.')[0] + '.' : desc.slice(0, 100))

    // Sort matched photos by priority and slice up to 5
    const matchedEntries = matchedFilesBySku.get(sku.toLowerCase()) ?? []
    matchedEntries.sort((a, b) => a.priority - b.priority)
    const matchedFiles = matchedEntries.slice(0, 5).map((e) => e.file)
    totalPhotosMatched += matchedFiles.length

    const isExisting = existingSkuMap.has(sku.toLowerCase())

    // Validation 8: Photo requirement
    // If it's a completely new product and no photos were matched, flag as blocking error
    if (!isExisting && matchedFiles.length === 0) {
      errors.push(`New product requires at least 1 photo (e.g. ${sku}.jpg).`)
    }

    if (errors.length > 0) {
      totalErrors += errors.length
    }

    products.push({
      rowNumber,
      sku,
      name,
      categoryName,
      categorySlug,
      price: priceNum || 0,
      compareAtPrice: compareAtPriceNum,
      stock: stockNum || 0,
      shortDescription: finalShortDesc,
      description: desc,
      active: activeRaw !== 'false' && activeRaw !== '0' && activeRaw !== 'no',
      isBestSeller: isBestSellerRaw === 'true' || isBestSellerRaw === '1' || isBestSellerRaw === 'yes',
      isNew: isNewRaw === 'true' || isNewRaw === '1' || isNewRaw === 'yes',
      tone: tone || undefined,
      slug: slugRaw ? toSlug(slugRaw) : (name ? toSlug(name) : undefined),
      matchedFiles,
      errors,
      isExisting,
    })
  })

  return {
    products,
    unmatchedFiles,
    totalPhotosMatched,
    totalErrors,
    canImport: products.length > 0 && totalErrors === 0,
  }
}
