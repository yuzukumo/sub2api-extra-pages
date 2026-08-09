import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogService } from './catalog-service'

afterEach(() => {
  vi.restoreAllMocks()
})

function modelsResponse(modelId: string, name: string, input: number): Response {
  return new Response(JSON.stringify({
    openai: {
      id: 'openai',
      name: 'OpenAI',
      models: {
        [modelId]: { id: modelId, name, cost: { input } },
      },
    },
  }), { status: 200 })
}

function groupsResponse(multiplier = 1.5): Response {
  return new Response(JSON.stringify({
    data: {
      items: [{ id: 1, name: 'Standard', platform: 'openai', status: 'active', rate_multiplier: multiplier }],
    },
  }), { status: 200 })
}

function accountsResponse(groupIds = [1]): Response {
  return new Response(JSON.stringify({
    data: {
      items: [{ id: 1, platform: 'openai', status: 'active', schedulable: true, group_ids: groupIds }],
    },
  }), { status: 200 })
}

function accountModelsResponse(models = ['gpt-test']): Response {
  return new Response(JSON.stringify({ data: models.map((id) => ({ id })) }), { status: 200 })
}

function createService(cacheFile: string): CatalogService {
  return new CatalogService({
    cacheFile,
    sub2ApiUrl: 'http://sub2api:8080',
    sub2ApiAdminApiKey: 'admin-key',
  })
}

describe('CatalogService', () => {
  it('builds the catalog from Sub2API models at startup and does not sync when it is read', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sub2api-catalog-'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/admin/accounts/') && url.endsWith('/models')) return accountModelsResponse()
      if (url.includes('/admin/accounts')) return accountsResponse()
      if (url.includes('/admin/groups')) return groupsResponse()
      return modelsResponse('gpt-test', 'GPT Test', 1)
    })

    try {
      const service = createService(join(directory, 'catalog.json'))
      await service.initialize()
      await service.getCatalog()
      await service.getCatalog()

      expect((await service.getCatalog()).models.map((model) => model.id)).toEqual(['gpt-test'])
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('refreshes models.dev metadata when Sub2API available models change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sub2api-catalog-'))
    const replies = [
      groupsResponse(), accountsResponse(), accountModelsResponse(['gpt-initial']), modelsResponse('gpt-initial', 'Initial name', 1),
      groupsResponse(), accountsResponse(), accountModelsResponse(['gpt-updated']), modelsResponse('gpt-updated', 'Updated name', 2),
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => replies.shift()!)

    try {
      const service = createService(join(directory, 'catalog.json'))
      await service.initialize()
      await service.sync()

      expect((await service.getCatalog()).models[0]).toMatchObject({
        id: 'gpt-updated',
        name: 'Updated name',
        pricing: { input: 2 },
        groupPricing: [{ groupId: '1', pricing: { input: 3 } }],
      })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('retries pending models.dev metadata after a changed model set fails to refresh', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sub2api-catalog-'))
    const replies = [
      groupsResponse(), accountsResponse(), accountModelsResponse(['gpt-initial']), modelsResponse('gpt-initial', 'Initial name', 1),
      groupsResponse(), accountsResponse(), accountModelsResponse(['gpt-updated']), new Response('', { status: 503 }),
      groupsResponse(), accountsResponse(), accountModelsResponse(['gpt-updated']), modelsResponse('gpt-updated', 'Updated name', 2),
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => replies.shift()!)

    try {
      const service = createService(join(directory, 'catalog.json'))
      const syncGroups = (service as unknown as { syncGroups: () => Promise<void> }).syncGroups.bind(service)
      await service.initialize()
      await expect(syncGroups()).rejects.toThrow('models.dev returned 503')
      await syncGroups()

      expect((await service.getCatalog()).models[0]).toMatchObject({
        id: 'gpt-updated',
        name: 'Updated name',
        pricing: { input: 2 },
      })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('keeps cached models available and reapplies the current group multiplier during a models.dev outage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sub2api-catalog-'))
    const cacheFile = join(directory, 'catalog.json')
    await writeFile(cacheFile, JSON.stringify({
      version: 7,
      updatedAt: '2026-08-06',
      currency: 'USD',
      priceUnit: 'MTok',
      models: [{
        id: 'gpt-test', name: 'GPT Test', provider: 'OpenAI', icon: 'openai', capabilities: [],
        pricing: { input: 1 }, groupPricing: [{ groupId: '1', pricing: { input: 1 } }],
      }],
      groups: [{ id: '1', name: 'Standard', platform: 'openai', rateMultiplier: 1 }],
    }), 'utf8')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(groupsResponse(1.5))
      .mockResolvedValueOnce(accountsResponse())
      .mockResolvedValueOnce(accountModelsResponse())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const service = createService(cacheFile)
      await service.initialize()

      const catalog = await service.getCatalog()
      expect(catalog.groups).toEqual([expect.objectContaining({ id: '1', rateMultiplier: 1.5 })])
      expect(catalog.models[0]?.groupPricing).toEqual([{ groupId: '1', pricing: { input: 1.5 } }])
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
