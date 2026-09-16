import { Schema, model } from 'mongoose'

const counterSchema = new Schema({ _id: String, value: { type: Number, default: 0 } }, { versionKey: false })
export const CounterModel = model('Counter', counterSchema)
