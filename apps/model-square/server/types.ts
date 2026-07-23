export interface ModelsDevCost {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
}

export interface ModelsDevReasoningOption {
  type?: string
  values?: string[]
}

export interface ModelsDevModel {
  id?: string
  name?: string
  description?: string
  family?: string
  attachment?: boolean
  reasoning?: boolean
  reasoning_options?: ModelsDevReasoningOption[]
  tool_call?: boolean
  structured_output?: boolean
  open_weights?: boolean
  modalities?: {
    input?: string[]
    output?: string[]
  }
  limit?: {
    context?: number
    output?: number
  }
  cost?: ModelsDevCost
  last_updated?: string
}

export interface ModelsDevProvider {
  id?: string
  name?: string
  models?: Record<string, ModelsDevModel>
}

export type ModelsDevResponse = Record<string, ModelsDevProvider>

export interface CatalogModel {
  id: string
  name: string
  provider: string
  icon: string
  description?: string
  capabilities: string[]
  contextWindow?: number
  maxOutput?: number
  pricing: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
  }
}

export interface CatalogResponse {
  version: 2
  updatedAt: string
  currency: 'USD'
  priceUnit: 'MTok'
  notice?: string
  models: CatalogModel[]
}
