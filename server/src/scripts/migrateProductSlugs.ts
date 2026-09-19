import { connectDatabase, disconnectDatabase } from '../config/database'
import { ProductModel } from '../models/productDocument'
import {
  planSlugMigration,
  formatMigrationPlanTable,
  formatMigrationSummary,
  executeSlugMigration,
} from '../utils/slugMigration'

async function run() {
  const isApply = process.argv.includes('--apply')

  console.log('============================================================')
  console.log('              RAJA STORE PRODUCT SLUG MIGRATION             ')
  console.log('============================================================')
  console.log(`Mode: ${isApply ? 'APPLY (Write to MongoDB)' : 'DRY RUN (Default - Read Only)'}`)
  console.log('Connecting to database...')

  const connected = await connectDatabase()
  if (!connected) {
    console.error('Failed to connect to MongoDB. Aborting.')
    process.exit(1)
  }

  try {
    const rawProducts = await ProductModel.find(
      {},
      'productId sku name slug'
    ).lean()

    const plan = planSlugMigration(
      rawProducts.map((p) => ({
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
      }))
    )

    console.log(formatMigrationPlanTable(plan))
    console.log(formatMigrationSummary(plan, isApply))

    if (!isApply) {
      console.log('\n[NOTICE] Dry run completed. MongoDB was NOT modified.')
      console.log('To apply these changes to the database, run with --apply:\n')
      console.log('  npm run migrate:slugs -- --apply\n')
      await disconnectDatabase()
      process.exit(0)
    }

    if (!plan.isValid) {
      console.error('\n[ABORTED] Migration failed validation. No changes were applied.')
      await disconnectDatabase()
      process.exit(1)
    }

    console.log('\nApplying slug updates to MongoDB...')
    const result = await executeSlugMigration(ProductModel, plan, { apply: true })

    if (result.success) {
      console.log(`\n[SUCCESS] Successfully updated ${result.updatedCount} product slugs in MongoDB.`)
      await disconnectDatabase()
      process.exit(0)
    } else {
      console.error('\n[ERROR] Migration execution failed:', result.errors)
      await disconnectDatabase()
      process.exit(1)
    }
  } catch (error) {
    console.error('Migration encountered an unexpected error:', error)
    await disconnectDatabase()
    process.exit(1)
  }
}

void run()
