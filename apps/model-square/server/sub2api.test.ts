import { describe, expect, it, vi } from 'vitest'
import {
  appendRateHistory,
  attachGroupPricing,
  collectAvailableModelIds,
  fetchSub2ApiGroups,
  multiplyPricing,
  RATE_HISTORY_MAX_SNAPSHOTS,
} from './sub2api'

describe('Sub2API group integration', () => {
  it('parses the v0.1.171 paginated group response and sends the admin API key server-side', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/models-list-candidates')) {
        return new Response(JSON.stringify({ data: { models: ['gpt-test', 'custom-model'] } }), { status: 200 })
      }
      return new Response(JSON.stringify({
        code: 0,
        data: {
          items: [
            { id: 1, name: 'Standard', platform: 'openai', status: 'active', rate_multiplier: 1.2 },
            { id: 2, name: 'Disabled', platform: 'openai', status: 'inactive', rate_multiplier: 1 },
            { id: 3, name: 'Private', platform: 'openai', status: 'active', is_exclusive: true, rate_multiplier: 1 },
          ],
        },
      }), { status: 200 })
    })

    const groups = await fetchSub2ApiGroups('http://sub2api:8080/', 'admin-key')

    expect(groups).toEqual([expect.objectContaining({
      id: '1', name: 'Standard', rateMultiplier: 1.2, models: ['gpt-test', 'custom-model'],
    })])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/groups?page=1&page_size=1000',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sub2api:8080/api/v1/admin/groups/1/models-list-candidates',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
    )
    fetchMock.mockRestore()
  })

  it('uses Sub2API group models when calculating each model price', () => {
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
        modelsListEnabled: false, models: ['gpt-test'],
      },
      {
        id: 'other', name: 'Other', platform: 'openai', rateMultiplier: 0.8,
        modelsListEnabled: false, models: ['other-model'],
      },
    ])

    expect(model?.groupPricing).toEqual([{
      groupId: 'standard',
      pricing: { input: 3, output: 12, tiers: [{ contextWindow: 128000, pricing: { input: 6 } }] },
    }])
  })

  it('does not assign pricing when a model is absent from a group candidate list', () => {
    const [model] = attachGroupPricing([{
      id: 'gpt-test',
      name: 'GPT Test',
      provider: 'OpenAI',
      icon: 'openai',
      capabilities: [],
      pricing: { input: 2 },
    }], [{
      id: 'composite', name: 'Composite', platform: 'composite', rateMultiplier: 1.5, models: [],
      modelsListEnabled: false,
    }])

    expect(model?.groupPricing).toBeUndefined()
  })

  it('collects available model IDs once and sorts them alphabetically', () => {
    expect(collectAvailableModelIds([
      { id: '1', name: 'One', platform: 'openai', rateMultiplier: 1, modelsListEnabled: false, models: ['model-z', 'model-a'] },
      { id: '2', name: 'Two', platform: 'anthropic', rateMultiplier: 1, modelsListEnabled: false, models: ['model-a', 'model-b'] },
    ])).toEqual(['model-a', 'model-b', 'model-z'])
  })

  it('records periodic snapshots for each group', () => {
    const history = appendRateHistory([
      { date: '2026-08-05', recordedAt: '2026-08-05T00:00:00.000Z', groups: [{ groupId: '1', multiplier: 1 }] },
      { date: '2026-08-06', recordedAt: '2026-08-06T00:00:00.000Z', groups: [{ groupId: '1', multiplier: 1 }] },
    ], [{ id: '1', name: 'Standard', platform: 'openai', rateMultiplier: 1.5, modelsListEnabled: false, models: [] }], '2026-08-06', '2026-08-06T12:00:00.000Z')

    expect(history).toEqual([
      { date: '2026-08-05', recordedAt: '2026-08-05T00:00:00.000Z', groups: [{ groupId: '1', multiplier: 1 }] },
      { date: '2026-08-06', recordedAt: '2026-08-06T00:00:00.000Z', groups: [{ groupId: '1', multiplier: 1 }] },
      { date: '2026-08-06', recordedAt: '2026-08-06T12:00:00.000Z', groups: [{ groupId: '1', multiplier: 1.5 }] },
    ])
  })

  it('retains the newest 180 days of ten-minute snapshots', () => {
    const history = Array.from({ length: RATE_HISTORY_MAX_SNAPSHOTS }, (_, index) => ({
      date: '2026-08-06',
      recordedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      groups: [{ groupId: '1', multiplier: 1 }],
    }))
    const result = appendRateHistory(
      history,
      [{ id: '1', name: 'Standard', platform: 'openai', rateMultiplier: 1.5, modelsListEnabled: false, models: [] }],
      '2026-08-06',
      '2027-01-01T00:00:00.000Z',
    )

    expect(result).toHaveLength(RATE_HISTORY_MAX_SNAPSHOTS)
    expect(result[0]?.recordedAt).toBe(history[1]?.recordedAt)
    expect(result.at(-1)?.recordedAt).toBe('2027-01-01T00:00:00.000Z')
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
