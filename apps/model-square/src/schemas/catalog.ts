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

const groupSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  platform: z.string().trim().min(1),
  rateMultiplier: z.number().nonnegative(),
  status: z.string().trim().min(1).optional(),
})

const groupPricingSchema = z.object({
  groupId: z.string().trim().min(1),
  pricing: modelPricingSchema,
})

const historyPointSchema = z.object({
  date: z.iso.date(),
  recordedAt: z.iso.datetime(),
  groups: z.array(z.object({
    groupId: z.string().trim().min(1),
    multiplier: z.number().nonnegative(),
  })),
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
  groupPricing: z.array(groupPricingSchema).optional(),
})

export const catalogSchema = z.object({
  version: z.literal(6),
  updatedAt: z.iso.date(),
  currency: z.enum(['USD', 'CNY']).default('USD'),
  priceUnit: z.enum(['MTok', 'KTok']).default('MTok'),
  notice: z.string().trim().min(1).optional(),
  models: z.array(modelSchema),
  groups: z.array(groupSchema).optional(),
  rateHistory: z.array(historyPointSchema).optional(),
})
