import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { HttpError } from '../utils/httpError'

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) return next(error)
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(400).json({ success: false, code: 'INVALID_UPLOAD', message: 'Uploaded images must be 5 MB or smaller.' })
  if (error instanceof HttpError) return response.status(error.status).json({ success: false, code: error.code, message: error.message })
  if (typeof error === 'object' && error !== null && ((error as Record<string, unknown>).status === 413 || (error as Record<string, unknown>).statusCode === 413 || (error as Record<string, unknown>).type === 'entity.too.large')) {
    return response.status(413).json({ success: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.' })
  }
  console.error('[RequestError]', {
    requestId: response.locals.requestId,
    name: error instanceof Error ? error.name : 'UnknownError',
  })
  response.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Unable to process your request. Please try again.' })
}
