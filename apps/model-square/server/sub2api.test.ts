import { describe, expect, it, vi } from 'vitest'
import {
  attachGroupPricing,
  collectAvailableModelIds,
  fetchSub2ApiGroups,
  multiplyPricing,
} from './sub2api'

describe('Sub2API group integration', () => {
  it('uses currently schedulable account mappings and deduplicates them within each group', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/admin/accounts/15/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'claude-default' }] }), { status: 200 })
      }
      if (url.includes('/admin/accounts')) {
        return new Response(JSON.stringify({
          data: {
            items: [
              {
                id: 10, platform: 'openai', status: 'active', schedulable: true, group_ids: [1],
                credentials: { model_mapping: { 'gpt-test': 'gpt-test', 'shared-model': 'shared-model' } },
              },
              {
                id: 11, platform: 'openai', status: 'active', schedulable: true, group_ids: [1],
                credentials: { model_mapping: { 'custom-model': 'custom-model', 'shared-model': 'shared-model' } },
              },
              {
                id: 12, platform: 'gemini', status: 'active', schedulable: true, group_ids: [2],
                credentials: { model_mapping: { 'gemini-2.5-pro': 'gemini-2.5-pro' } },
              },
              {
                id: 13, platform: 'gemini', status: 'active', schedulable: true, group_ids: [2],
                credentials: { model_mapping: { 'gemini-2.5-flash': 'gemini-2.5-flash' } },
              },
              { id: 14, platform: 'gemini', status: 'active', schedulable: true, group_ids: [2] },
              { id: 15, platform: 'anthropic', status: 'active', schedulable: true, group_ids: [3] },
              {
                id: 16, platform: 'gemini', status: 'active', schedulable: false, group_ids: [2],
                credentials: { model_mapping: { 'gemini-disabled': 'gemini-disabled' } },
              },
              {
                id: 17, platform: 'gemini', status: 'inactive', schedulable: true, group_ids: [2],
                credentials: { model_mapping: { 'gemini-inactive': 'gemini-inactive' } },
              },
              {
                id: 18, platform: 'gemini', status: 'active', schedulable: true, group_ids: [1],
                credentials: { model_mapping: { 'gemini-wrong-group-platform': 'gemini-wrong-group-platform' } },
              },
              {
                id: 19, platform: 'gemini', status: 'active', schedulable: true, group_ids: [2],
                rate_limit_reset_at: '2999-01-01T00:00:00.000Z',
                credentials: { model_mapping: { 'gemini-rate-limited': 'gemini-rate-limited' } },
              },
            ],
          },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        code: 0,
        data: {
          items: [
            { id: 1, name: 'Standard', platform: 'openai', status: 'active', rate_multiplier: 1.2 },
            { id: 2, name: 'Gemini', platform: 'gemini', status: 'active', rate_multiplier: 1 },
            { id: 3, name: 'Defaults', platform: 'anthropic', status: 'active', rate_multiplier: 1 },
            { id: 4, name: 'Disabled', platform: 'openai', status: 'inactive', rate_multiplier: 1 },
            { id: 5, name: 'Private', platform: 'openai', status: 'active', is_exclusive: true, rate_multiplier: 1 },
          ],
        },
      }), { status: 200 })
    })

    const groups = await fetchSub2ApiGroups('http://sub2api:8080/', 'admin-key')

    expect(groups).toEqual([
      expect.objectContaining({
        id: '1', name: 'Standard', rateMultiplier: 1.2,
        models: ['custom-model', 'gpt-test', 'shared-model'],
      }),
      expect.objectContaining({
        id: '2', name: 'Gemini', rateMultiplier: 1,
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      }),
      expect.objectContaining({
        id: '3', name: 'Defaults', rateMultiplier: 1,
        models: ['claude-default'],
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/groups?page=1&page_size=1000',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/accounts?page=1&page_size=1000&status=active',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/accounts/15/models',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/accounts/14/models',
      expect.anything(),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/accounts/12/models',
      expect.anything(),
    )
    fetchMock.mockRestore()
  })

  it('uses account-derived group models when calculating each model price', () => {
    const [model] = attachGroupPricing([{
      id: 'gpt-test',
      name: 'GPT Test',
      provider: 'OpenAI',
      icon: 'openai',
      capabilities: [],
      pricing: { input: 2, output: 8, tiers: [{ contextWindow: 128000, pricing: { input: 4 } }] },
    }], [
      {
        id: 'standard', name: 'Standard', platform: 'openai', rateMultiplier: 1.5,
        models: ['gpt-test'],
      },
      {
        id: 'other', name: 'Other', platform: 'openai', rateMultiplier: 0.8,
        models: ['other-model'],
      },
    ])

    expect(model?.groupPricing).toEqual([{
      groupId: 'standard',
      pricing: { input: 3, output: 12, tiers: [{ contextWindow: 128000, pricing: { input: 6 } }] },
    }])
  })

  it('does not assign pricing when a model is absent from a group account list', () => {
    const [model] = attachGroupPricing([{
      id: 'gpt-test',
      name: 'GPT Test',
      provider: 'OpenAI',
      icon: 'openai',
      capabilities: [],
      pricing: { input: 2 },
    }], [{
      id: 'composite', name: 'Composite', platform: 'composite', rateMultiplier: 1.5, models: [],
    }])

    expect(model?.groupPricing).toBeUndefined()
  })

  it('collects available model IDs once and sorts them alphabetically', () => {
    expect(collectAvailableModelIds([
      { id: '1', name: 'One', platform: 'openai', rateMultiplier: 1, models: ['model-z', 'model-a'] },
      { id: '2', name: 'Two', platform: 'anthropic', rateMultiplier: 1, models: ['model-a', 'model-b'] },
    ])).toEqual(['model-a', 'model-b', 'model-z'])
  })

  it('multiplies all token price categories including tier prices', () => {
    expect(multiplyPricing({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }, 1.2)).toEqual({
      input: 2.4,
      output: 12,
      cacheRead: 0.24,
      cacheWrite: 3,
    })
  })
})
