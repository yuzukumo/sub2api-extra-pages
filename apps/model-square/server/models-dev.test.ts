import { describe, expect, it } from 'vitest'
import { findModelCandidate, normalizeCatalog } from './models-dev'
import type { ModelsDevResponse } from './types'

const fixture: ModelsDevResponse = {
  gateway: {
    id: 'gateway',
    name: 'Gateway',
    models: {
      'gpt-5.4': { id: 'gpt-5.4', name: 'Gateway GPT', cost: { input: 1 } },
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: {
      'gpt-5.4': {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        description: 'Official model',
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
        tool_call: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        limit: { context: 400000, output: 128000 },
        cost: { input: 2.5, output: 15, cache_read: 0.25, cache_write: 3.75 },
      },
    },
  },
}

describe('models.dev normalization', () => {
  it('prefers the official provider when the same model id appears multiple times', () => {
    expect(findModelCandidate(fixture, 'gpt-5.4')?.provider.id).toBe('openai')
  })

  it('normalizes metadata, capabilities and price', () => {
    const catalog = normalizeCatalog(fixture, ['gpt-5.4'])
    expect(catalog.models[0]).toMatchObject({
      id: 'gpt-5.4',
      name: 'GPT-5.4',
      provider: 'OpenAI',
      icon: 'openai',
      capabilities: ['text', 'vision', 'reasoning', 'toolCall'],
      contextWindow: 400000,
      pricing: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 3.75 },
    })
  })

  it('keeps configured ids visible when upstream metadata is missing', () => {
    expect(normalizeCatalog(fixture, ['custom-model']).models[0]).toMatchObject({
      id: 'custom-model',
      provider: 'unknown',
      icon: 'generic',
    })
  })

  it('omits unusable zero limits from upstream metadata', () => {
    const zeroLimits: ModelsDevResponse = {
      openai: {
        id: 'openai',
        name: 'OpenAI',
        models: {
          'gpt-image': {
            id: 'gpt-image',
            limit: { context: 0, output: 0 },
          },
        },
      },
    }

    const model = normalizeCatalog(zeroLimits, ['gpt-image']).models[0]
    expect(model.contextWindow).toBeUndefined()
    expect(model.maxOutput).toBeUndefined()
  })

  it('shows the model creator instead of a gateway provider', () => {
    const gatewayOnly: ModelsDevResponse = {
      gateway: {
        id: 'gateway',
        name: 'Gateway',
        models: {
          'grok-4': { id: 'grok-4', name: 'Grok 4', cost: { input: 3, output: 15 } },
        },
      },
    }
    expect(normalizeCatalog(gatewayOnly, ['grok-4']).models[0]).toMatchObject({
      provider: 'xAI',
      icon: 'grok',
    })
  })
})
