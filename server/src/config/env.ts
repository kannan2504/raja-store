import dotenv from 'dotenv'
import path from 'node:path'
import { z } from 'zod'

dotenv.config()
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env'), override: true })

const additionalOriginsSchema = z
  .string()
  .default('')
  .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
  .pipe(z.array(z.string().url()).max(10))

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().default(''),
  PERSISTENCE_MODE: z.enum(['memory', 'mongo']).default('memory'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ADDITIONAL_FRONTEND_URLS: additionalOriginsSchema,
  DELIVERY_CHARGE: z.coerce.number().nonnegative().default(50),
  MINIMUM_ORDER_VALUE: z.coerce.number().nonnegative().default(200),
  MAX_ITEM_QUANTITY: z.coerce.number().int().positive().default(100),
  STORE_NAME: z.string().min(1).default('Raja Store'),
  STORE_UPI_ID: z.string().default('yourupi@upi'),
  STORE_UPI_QR_URL: z.string().url().default('https://placehold.co/360x360/f3eadb/29382a?text=Raja+Store+UPI+QR'),
  ADMIN_API_TOKEN: z.string().default(''),
  ADMIN_NOTIFICATION_EMAIL: z.string().trim().email().optional().or(z.literal('')),
  ADMIN_NOTIFICATION_WHATSAPP: z.string().trim().optional().or(z.literal('')),
  GMAIL_SMTP_USER: z.string().trim().email().optional().or(z.literal('')),
  GMAIL_SMTP_APP_PASSWORD: z.string().trim().optional().or(z.literal('')),
  RESEND_API_KEY: z.string().trim().optional().default(''),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
}).superRefine((configuration, context) => {
  if (configuration.NODE_ENV !== 'production') return

  const requiredValues: Array<[keyof typeof configuration, string]> = [
    ['DATABASE_URL', 'DATABASE_URL is required in production.'],
    ['ADMIN_API_TOKEN', 'ADMIN_API_TOKEN is required in production.'],
    ['ADMIN_NOTIFICATION_EMAIL', 'ADMIN_NOTIFICATION_EMAIL is required in production.'],
    ['RESEND_API_KEY', 'RESEND_API_KEY is required in production.'],
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_CLOUD_NAME is required in production.'],
    ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_KEY is required in production.'],
    ['CLOUDINARY_API_SECRET', 'CLOUDINARY_API_SECRET is required in production.'],
  ]

  for (const [key, message] of requiredValues) {
    const value = configuration[key]
    if (typeof value !== 'string' || !value.trim()) {
      context.addIssue({ code: 'custom', path: [key], message })
    }
  }

  if (configuration.PERSISTENCE_MODE !== 'mongo') {
    context.addIssue({ code: 'custom', path: ['PERSISTENCE_MODE'], message: 'PERSISTENCE_MODE must be mongo in production.' })
  }

})

const parsed = environmentSchema.safeParse(process.env)
if (!parsed.success) throw new Error('Invalid server environment configuration')

export const env = parsed.data
