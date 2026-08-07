export const iconKeys = [
  'generic',
  'openai',
  'anthropic',
  'claude',
  'gemini',
  'deepseek',
  'grok',
  'mistral',
  'qwen',
  'meta',
] as const

export type IconKey = (typeof iconKeys)[number]

export type Locale = 'en-US' | 'zh-CN' | 'zh-TW' | 'ru-RU'

export interface ModelPriceFields {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

export interface ModelPricing extends ModelPriceFields {
  tiers?: ModelPricingTier[]
}

export interface ModelPricingTier {
  contextWindow: number
  pricing: ModelPriceFields
}

export interface CatalogGroup {
  id: string
  name: string
  platform: string
  rateMultiplier: number
  status?: string
}

export interface CatalogGroupPricing {
  groupId: string
  pricing: ModelPricing
}

export interface CatalogModel {
  id: string
  name: string
  provider: string
  icon: IconKey
  description?: string
  capabilities: string[]
  contextWindow?: number
  maxOutput?: number
  pricing: ModelPricing
  groupPricing?: CatalogGroupPricing[]
}

export interface ModelCatalog {
  version: 7
  updatedAt: string
  currency: 'USD' | 'CNY'
  priceUnit: 'MTok' | 'KTok'
  notice?: string
  models: CatalogModel[]
  groups?: CatalogGroup[]
}

export interface CatalogFilters {
  query: string
  provider?: string
}
