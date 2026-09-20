import { env } from './config/env'
import { connectDatabase } from './config/database'
import { makeApp } from './appFactory'
import { InMemoryOrderRepository } from './repositories/orderRepository'
import { InMemoryProductRepository } from './repositories/productRepository'
import { MongoOrderRepository } from './repositories/mongoOrderRepository'
import { MongoProductRepository } from './repositories/mongoProductRepository'

async function start() {
	const connected = await connectDatabase()

	if (env.NODE_ENV === 'production') {
		if (!connected) {
			throw new Error('MongoDB connection failed. Production cannot start without MongoDB.')
		}
		const application = makeApp(new MongoProductRepository(), new MongoOrderRepository(), true, 'mongo')
		application.listen(env.PORT, () => console.log(`Raja Store API listening on port ${env.PORT} using MongoDB persistence`))
		return
	}

	const application = connected
		? makeApp(new MongoProductRepository(), new MongoOrderRepository(), true, 'mongo')
		: makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository(), false, env.PERSISTENCE_MODE)
	application.listen(env.PORT, () => console.log(`Raja Store API listening on port ${env.PORT} using ${connected ? 'MongoDB' : 'development memory'} persistence`))
}

void start().catch((error) => {
	console.error('Fatal startup error:', error instanceof Error ? error.message : error)
	process.exit(1)
})
