import { makeApp } from './appFactory'
import { InMemoryOrderRepository } from './repositories/orderRepository'
import { InMemoryProductRepository } from './repositories/productRepository'

export const app = makeApp(new InMemoryProductRepository(), new InMemoryOrderRepository())
