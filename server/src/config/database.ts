import mongoose from 'mongoose'
import { env } from './env'

let connected = false

export async function connectDatabase() {
  if (!env.DATABASE_URL) {
    if (env.NODE_ENV === 'production' || env.PERSISTENCE_MODE === 'mongo') throw new Error('DATABASE_URL is required for MongoDB persistence')
    return false
  }
  try {
    await mongoose.connect(env.DATABASE_URL, { serverSelectionTimeoutMS: 5000 })
    connected = true
    return true
  } catch (error) {
    console.error('MongoDB connection failed', error)
    if (env.NODE_ENV === 'production' || env.PERSISTENCE_MODE === 'mongo') throw new Error('Database connection failed')
    return false
  }
}

export function isDatabaseConnected() {
  return connected && mongoose.connection.readyState === 1
}

export async function disconnectDatabase() {
  if (connected) await mongoose.disconnect()
  connected = false
}
