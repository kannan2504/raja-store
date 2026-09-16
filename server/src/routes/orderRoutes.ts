import { createOrderRoutes } from './createOrderRoutes'
import { InMemoryOrderRepository } from '../repositories/orderRepository'
import { InMemoryProductRepository } from '../repositories/productRepository'

export const orderRoutes = createOrderRoutes(new InMemoryProductRepository(), new InMemoryOrderRepository())
