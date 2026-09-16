import type { ErrorRequestHandler } from 'express'
import multer from 'multer'

export const errorHandler: ErrorRequestHandler = (_error, _request, response, _next) => {
  if (_error instanceof multer.MulterError && _error.code === 'LIMIT_FILE_SIZE') return response.status(400).json({ success: false, code: 'INVALID_PAYMENT_PROOF', message: 'Payment proof must be 5 MB or smaller.' })
  response.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Unable to process your request. Please try again.' })
}
