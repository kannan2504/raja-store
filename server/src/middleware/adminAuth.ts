import type { RequestHandler } from 'express'
import { env } from '../config/env'

export const requireAdmin: RequestHandler = (request, response, next) => {
  const token = request.header('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!env.ADMIN_API_TOKEN || !token || token !== env.ADMIN_API_TOKEN) return response.status(401).json({ success: false, code: 'ADMIN_UNAUTHORIZED', message: 'Admin authorization required.' })
  next()
}
