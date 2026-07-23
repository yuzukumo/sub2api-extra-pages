import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogService } from './catalog-service'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CatalogService', () => {
  it('syncs on startup and does not sync when the catalog is read', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sub2api-catalog-'))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      openai: {
        id: 'openai',
        name: 'OpenAI',
        models: {
          'gpt-test': {
            id: 'gpt-test',
            name: 'GPT Test',
            cost: { input: 1, output: 2 },
          },
        },
      },
    }), { status: 200 }))

    try {
      const service = new CatalogService({
        cacheFile: join(directory, 'catalog.json'),
        modelIds: ['gpt-test'],
      })
      await service.initialize()
      await service.getCatalog()
      await service.getCatalog()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
