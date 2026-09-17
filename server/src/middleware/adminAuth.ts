import type { RequestHandler } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'

export const requireAdmin: RequestHandler = (request, response, next) => {
  const authorization = request.header('Authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim() ?? ''
  const expected = env.ADMIN_API_TOKEN.trim()
  const valid = Boolean(expected && token) && timingSafeEqual(
    createHash('sha256').update(token).digest(),
    createHash('sha256').update(expected).digest(),
  )
  if (!valid) return response.status(401).json({ success: false, code: 'ADMIN_UNAUTHORIZED', message: 'Admin authorization required.' })
  next()
}
