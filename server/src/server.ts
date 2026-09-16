import { env } from './config/env'
import { connectDatabase } from './config/database'
import { makeApp } from './appFactory'
import { InMemoryOrderRepository } from './repositories/orderRepository'
import { InMemoryProductRepository } from './repositories/productRepository'
import { MongoOrderRepository } from './repositories/mongoOrderRepository'
import { MongoProductRepository } from './repositories/mongoProductRepository'

async function start() {
	const connected = await connectDatabase()
	const application = connected ? makeApp(new MongoProductRepository(), new MongoOrderRepository(), true, 'mongo') : makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository(), false, env.PERSISTENCE_MODE)
	application.listen(env.PORT, () => console.log(`Raja Store API listening on port ${env.PORT} using ${connected ? 'MongoDB' : 'development memory'} persistence`))
}

void start().catch(() => process.exit(1))
