import { toSlug } from './slug'
import type { Model } from 'mongoose'
import type { ProductDocument } from '../models/productDocument'

export interface ProductSlugInput {
  productId: string
  sku: string
  name: string
  slug: string
  [key: string]: unknown
}

export interface SlugMigrationItem {
  productId: string
  sku: string
  name: string
  oldSlug: string
  proposedSlug: string
  action: 'KEEP' | 'UPDATE'
  collisionResolved: boolean
}

export interface SlugMigrationPlan {
  totalChecked: number
  alreadyCorrectCount: number
  toUpdateCount: number
  collisionCount: number
  items: SlugMigrationItem[]
  errors: string[]
  isValid: boolean
}

export interface MigrationExecutionResult {
  applied: boolean
  totalChecked: number
  updatedCount: number
  unchangedCount: number
  collisionCount: number
  success: boolean
  errors: string[]
}

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

/**
 * Plans slug migration deterministically without modifying database records.
 *
 * Rules:
 * 1. Base slug is derived via toSlug(product.name).
 * 2. If a product already owns the correct base slug (e.g. RS-KIT-013 "Vegetable Peeler" -> "vegetable-peeler"),
 *    it retains it without modification.
 * 3. Already-correct numbered slugs (baseSlug-2, baseSlug-3, etc.) are also preserved.
 * 4. Products with mismatched slugs or colliding names are assigned available slugs deterministically
 *    (baseSlug, baseSlug-2, baseSlug-3, ...) ordered by SKU and productId.
 * 5. All final proposed slugs are strictly validated for catalog-wide uniqueness before proceeding.
 */
export function planSlugMigration(products: ProductSlugInput[]): SlugMigrationPlan {
  const errors: string[] = []

  for (const p of products) {
    if (!p.productId) {
      errors.push(`Product missing productId (SKU: ${p.sku || 'UNKNOWN'})`)
    }
    if (!p.name || !p.name.trim()) {
      errors.push(`Product missing name (ID: ${p.productId}, SKU: ${p.sku || 'UNKNOWN'})`)
    }
  }

  // Sort deterministically by SKU ascending, then productId
  const sorted = [...products].sort((a, b) => {
    const skuComp = (a.sku || '').localeCompare(b.sku || '')
    if (skuComp !== 0) return skuComp
    return (a.productId || '').localeCompare(b.productId || '')
  })

  const claimedSlugs = new Set<string>()
  const assignments = new Map<
    string,
    { proposedSlug: string; action: 'KEEP' | 'UPDATE'; collisionResolved: boolean }
  >()

  // Pass 1: Prioritize products that ALREADY legitimately own their expected base slug or a valid numbered suffix.
  // Example: RS-KIT-013 "Vegetable Peeler" with slug "vegetable-peeler" -> retains "vegetable-peeler"
  for (const p of sorted) {
    const baseSlug = toSlug(p.name) || 'product'
    const isBaseMatch = p.slug === baseSlug
    const isNumberedMatch = new RegExp(`^${escapeRegex(baseSlug)}-[2-9]\\d*$`).test(p.slug)

    if ((isBaseMatch || isNumberedMatch) && !claimedSlugs.has(p.slug)) {
      claimedSlugs.add(p.slug)
      assignments.set(p.productId, {
        proposedSlug: p.slug,
        action: 'KEEP',
        collisionResolved: isNumberedMatch,
      })
    }
  }

  // Pass 2: Assign slugs to products needing an update or resolving collisions
  for (const p of sorted) {
    if (assignments.has(p.productId)) continue

    const baseSlug = toSlug(p.name) || 'product'
    let candidate = baseSlug
    let counter = 2
    let collisionResolved = false

    if (claimedSlugs.has(candidate)) {
      collisionResolved = true
      while (claimedSlugs.has(`${baseSlug}-${counter}`)) {
        counter++
      }
      candidate = `${baseSlug}-${counter}`
    }

    claimedSlugs.add(candidate)
    const action = candidate === p.slug ? 'KEEP' : 'UPDATE'
    assignments.set(p.productId, {
      proposedSlug: candidate,
      action,
      collisionResolved,
    })
  }

  const items: SlugMigrationItem[] = sorted.map((p) => {
    const assign = assignments.get(p.productId)!
    return {
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      oldSlug: p.slug,
      proposedSlug: assign.proposedSlug,
      action: assign.action,
      collisionResolved: assign.collisionResolved,
    }
  })

  // Validate all proposed slugs are non-empty and catalog-wide unique
  const seenSlugs = new Set<string>()
  for (const item of items) {
    if (!item.proposedSlug) {
      errors.push(`Empty proposed slug for SKU ${item.sku} (${item.productId})`)
    }
    if (seenSlugs.has(item.proposedSlug)) {
      errors.push(`Duplicate proposed slug detected: "${item.proposedSlug}" for SKU ${item.sku}`)
    }
    seenSlugs.add(item.proposedSlug)
  }

  const alreadyCorrectCount = items.filter((item) => item.action === 'KEEP').length
  const toUpdateCount = items.filter((item) => item.action === 'UPDATE').length
  const collisionCount = items.filter((item) => item.collisionResolved).length

  return {
    totalChecked: items.length,
    alreadyCorrectCount,
    toUpdateCount,
    collisionCount,
    items,
    errors,
    isValid: errors.length === 0,
  }
}

/**
 * Formats a clean tabular view of planned product slug updates.
 */
export function formatMigrationPlanTable(plan: SlugMigrationPlan): string {
  const lines: string[] = []
  const colSku = 14
  const colName = 40
  const colOld = 38
  const colNew = 38
  const colAction = 10

  const truncate = (val: string, maxLen: number) => {
    if (val.length <= maxLen) return val.padEnd(maxLen)
    return (val.slice(0, maxLen - 3) + '...').padEnd(maxLen)
  }

  const header = `${'SKU'.padEnd(colSku)} | ${'Product Name'.padEnd(colName)} | ${'Current Slug'.padEnd(colOld)} | ${'Proposed Slug'.padEnd(colNew)} | ${'Action'.padEnd(colAction)}`
  const separator = '-'.repeat(header.length)

  lines.push(separator)
  lines.push(header)
  lines.push(separator)

  for (const item of plan.items) {
    const actionLabel = item.collisionResolved && item.action === 'UPDATE' ? 'COLLISION' : item.action
    lines.push(
      `${truncate(item.sku || '', colSku)} | ${truncate(item.name || '', colName)} | ${truncate(item.oldSlug || '', colOld)} | ${truncate(item.proposedSlug || '', colNew)} | ${actionLabel.padEnd(colAction)}`
    )
  }
  lines.push(separator)
  return lines.join('\n')
}

/**
 * Formats the summary report and instructions.
 */
export function formatMigrationSummary(plan: SlugMigrationPlan, isApply: boolean): string {
  const lines: string[] = []
  lines.push('')
  lines.push('============================================================')
  lines.push('              RAJA STORE PRODUCT SLUG MIGRATION             ')
  lines.push('============================================================')
  lines.push(`Mode: ${isApply ? 'APPLY (Modifying Database)' : 'DRY RUN (Default - Read Only)'}`)
  lines.push(`Total products checked:         ${plan.totalChecked}`)
  lines.push(`Already correct (retained):    ${plan.alreadyCorrectCount}`)
  lines.push(`Mismatched slugs to update:    ${plan.toUpdateCount}`)
  lines.push(`Potential collisions resolved:  ${plan.collisionCount}`)
  lines.push(`Validation status:              ${plan.isValid ? 'PASSED (All proposed slugs are unique)' : 'FAILED'}`)

  if (plan.errors.length > 0) {
    lines.push('------------------------------------------------------------')
    lines.push('Validation Errors:')
    for (const err of plan.errors) {
      lines.push(`  - ${err}`)
    }
  }

  lines.push('------------------------------------------------------------')
  if (!isApply) {
    lines.push('[DRY RUN ONLY] No changes were made to MongoDB.')
    lines.push('To apply these changes, explicitly run with the --apply flag.')
  } else if (plan.isValid) {
    lines.push('[SUCCESS] Database update completed successfully.')
  } else {
    lines.push('[ABORTED] Migration aborted due to validation errors. No changes applied.')
  }
  lines.push('============================================================')
  return lines.join('\n')
}

/**
 * Executes the slug migration against MongoDB.
 *
 * Safety protections:
 * 1. Requires explicit { apply: true }. Otherwise returns without touching DB.
 * 2. If plan.isValid is false, immediately aborts without touching DB.
 * 3. Only modifies the `slug` field (never touches productId, sku, name, price, stock, images, etc.).
 * 4. Filters strictly by immutable productId.
 * 5. Uses safe 2-phase update for records being changed to eliminate transient unique key collisions.
 */
export interface UpdatableProductModel {
  updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<unknown>
}

export async function executeSlugMigration(
  productModel: UpdatableProductModel,
  plan: SlugMigrationPlan,
  options: { apply: boolean }
): Promise<MigrationExecutionResult> {
  if (!options.apply) {
    return {
      applied: false,
      totalChecked: plan.totalChecked,
      updatedCount: 0,
      unchangedCount: plan.alreadyCorrectCount,
      collisionCount: plan.collisionCount,
      success: true,
      errors: [],
    }
  }

  if (!plan.isValid || plan.errors.length > 0) {
    return {
      applied: false,
      totalChecked: plan.totalChecked,
      updatedCount: 0,
      unchangedCount: plan.totalChecked,
      collisionCount: plan.collisionCount,
      success: false,
      errors: plan.errors,
    }
  }

  const itemsToUpdate = plan.items.filter((item) => item.action === 'UPDATE')

  try {
    // Phase 1: Assign temporary unique slugs to all items to be updated.
    // This frees up existing slugs and eliminates transient E11000 duplicate key errors.
    for (const item of itemsToUpdate) {
      await productModel.updateOne(
        { productId: item.productId },
        { $set: { slug: `__temp_slug_${item.productId}__` } }
      )
    }

    // Phase 2: Assign final planned slug to each product.
    for (const item of itemsToUpdate) {
      await productModel.updateOne(
        { productId: item.productId },
        { $set: { slug: item.proposedSlug } }
      )
    }

    return {
      applied: true,
      totalChecked: plan.totalChecked,
      updatedCount: itemsToUpdate.length,
      unchangedCount: plan.alreadyCorrectCount,
      collisionCount: plan.collisionCount,
      success: true,
      errors: [],
    }
  } catch (error) {
    return {
      applied: false,
      totalChecked: plan.totalChecked,
      updatedCount: 0,
      unchangedCount: plan.totalChecked,
      collisionCount: plan.collisionCount,
      success: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}
