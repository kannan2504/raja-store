import type { Request, Response } from 'express'
import type { ProductRepository } from '../repositories/productRepository'
import type { ProductImageStorage } from '../services/productImageStorage'

export function makeProductController(products: ProductRepository) {
  return async (_request: Request, response: Response) => response.json({ success: true, products: await products.getCatalogProducts() })
}

export function makeProductImageController(storage: ProductImageStorage) {
  return (request: Request, response: Response) => {
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    try {
      const reference = Array.isArray(request.params.reference)
        ? request.params.reference.join('/')
        : (request.params.reference ?? '')
      const image = storage.get(reference)
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      if ('redirectUrl' in image && image.redirectUrl) {
        return response.redirect(302, image.redirectUrl)
      }
      if ('stream' in image && image.stream && image.contentType) {
        response.setHeader('Content-Type', image.contentType)
        image.stream.on('error', () => response.status(404).end())
        return image.stream.pipe(response)
      }
      response.status(404).json({ success: false, code: 'IMAGE_NOT_FOUND', message: 'Product image not found.' })
    } catch {
      response.status(404).json({ success: false, code: 'IMAGE_NOT_FOUND', message: 'Product image not found.' })
    }
  }
}
