import { z } from 'zod'
import { iconKeys } from '../types/catalog'

const optionalPrice = z.number().nonnegative().optional()

const pricingSchema = z.object({
  input: optionalPrice,
  output: optionalPrice,
  cacheRead: optionalPrice,
  cacheWrite: optionalPrice,
})

const pricingTierSchema = z.object({
  contextWindow: z.number().int().positive(),
  pricing: pricingSchema,
})

const modelPricingSchema = pricingSchema.extend({
  tiers: z.array(pricingTierSchema).optional(),
})

const modelSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  icon: z.enum(iconKeys),
  description: z.string().trim().min(1).optional(),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  pricing: modelPricingSchema,
})

export const catalogSchema = z.object({
  version: z.literal(3),
  updatedAt: z.iso.date(),
  currency: z.enum(['USD', 'CNY']).default('USD'),
  priceUnit: z.enum(['MTok', 'KTok']).default('MTok'),
  notice: z.string().trim().min(1).optional(),
  models: z.array(modelSchema),
})
