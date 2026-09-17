import dotenv from 'dotenv'
import path from 'node:path'
import { z } from 'zod'

dotenv.config()
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env'), override: true })

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().default(''),
  PERSISTENCE_MODE: z.enum(['memory', 'mongo']).default('memory'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DELIVERY_CHARGE: z.coerce.number().nonnegative().default(50),
  MINIMUM_ORDER_VALUE: z.coerce.number().nonnegative().default(200),
  MAX_ITEM_QUANTITY: z.coerce.number().int().positive().default(100),
  STORE_NAME: z.string().min(1).default('Raja Store'),
  STORE_UPI_ID: z.string().default('yourupi@upi'),
  STORE_UPI_QR_URL: z.string().url().default('https://placehold.co/360x360/f3eadb/29382a?text=Raja+Store+UPI+QR'),
  ADMIN_API_TOKEN: z.string().default(''),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().optional().or(z.literal('')),
  ADMIN_NOTIFICATION_WHATSAPP: z.string().optional().or(z.literal('')),
  GMAIL_SMTP_USER: z.string().email().optional().or(z.literal('')),
  GMAIL_SMTP_APP_PASSWORD: z.string().optional().or(z.literal('')),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
})

const parsed = environmentSchema.safeParse(process.env)
if (!parsed.success) throw new Error('Invalid server environment configuration')

export const env = parsed.data
