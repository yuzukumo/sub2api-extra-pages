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

export interface ModelPricing {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
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
}

export interface ModelCatalog {
  version: 2
  updatedAt: string
  currency: 'USD' | 'CNY'
  priceUnit: 'MTok' | 'KTok'
  notice?: string
  models: CatalogModel[]
}

export interface CatalogFilters {
  query: string
  provider?: string
}
