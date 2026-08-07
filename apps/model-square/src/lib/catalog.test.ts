import { describe, expect, it } from 'vitest'
import { filterModels, formatMultiplier, formatPrice, formatPriceUnit, formatTokenCount } from './catalog'
import type { CatalogModel } from '../types/catalog'

const models: CatalogModel[] = [
  {
    id: 'model-b',
    name: 'Beta',
    provider: 'Provider B',
    icon: 'openai',
    description: 'Fast vision model',
    capabilities: ['视觉'],
    pricing: { input: 2, output: 8 },
  },
  {
    id: 'model-a',
    name: 'Alpha',
    provider: 'Provider A',
    icon: 'claude',
    description: 'Reasoning model',
    capabilities: ['推理'],
    pricing: { input: 1, output: 10 },
  },
]

describe('catalog helpers', () => {
  it('filters across id and provider', () => {
    expect(filterModels(models, { query: 'model-a' })).toEqual([models[1]])
    expect(filterModels(models, { query: '', provider: 'Provider A' })).toEqual([models[1]])
  })

  it('preserves catalog order after filtering', () => {
    expect(filterModels(models, { query: '' }).map((model) => model.id)).toEqual(['model-b', 'model-a'])
  })

  it('formats token counts and catalog prices', () => {
    expect(formatTokenCount(200_000)).toBe('200K')
    expect(formatTokenCount(1_000_000)).toBe('1M')
    expect(formatPrice(2.5, { currency: 'USD', priceUnit: 'MTok' })).toBe('$2.5')
    expect(formatPriceUnit()).toBe('/1M')
    expect(formatMultiplier(0.09)).toBe('0.09x')
  })
})
