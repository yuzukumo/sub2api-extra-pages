import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fetchModelsDev, normalizeCatalog } from './models-dev.js'
import {
  attachGroupPricing,
  collectAvailableModelIds,
  fetchSub2ApiGroups,
  type ResolvedSub2ApiGroup,
} from './sub2api.js'
import type { CatalogResponse } from './types.js'

export interface CatalogServiceOptions {
  cacheFile: string
  sub2ApiUrl?: string
  sub2ApiAdminApiKey?: string
}

export class CatalogService {
  private catalog?: CatalogResponse
  private syncPromise?: Promise<CatalogResponse>
  private groupSyncPromise?: Promise<void>
  private groups: ResolvedSub2ApiGroup[] = []
  private modelIds: string[] = []
  private metadataRefreshPending = true

  constructor(private readonly options: CatalogServiceOptions) {}

  async initialize(): Promise<void> {
    await this.loadCache()

    let startupError: unknown
    try {
      await this.sync()
    } catch (error) {
      startupError = error
    }
    this.scheduleDailySync()
    if (this.hasSub2Api) this.scheduleGroupSync()
    if (startupError && !this.catalog) throw startupError
  }

  async getCatalog(): Promise<CatalogResponse> {
    if (!this.catalog) throw new Error('模型目录尚未同步')
    return this.catalog
  }

  async sync(): Promise<CatalogResponse> {
    if (this.syncPromise) return this.syncPromise
    this.syncPromise = this.performSync().finally(() => {
      this.syncPromise = undefined
    })
    return this.syncPromise
  }

  private async performSync(): Promise<CatalogResponse> {
    this.requireSub2Api()
    const { modelIds } = await this.refreshSub2ApiState()
    try {
      const upstream = await fetchModelsDev(AbortSignal.timeout(30_000))
      this.catalog = this.createCatalog(normalizeCatalog(upstream, modelIds))
      this.metadataRefreshPending = false
      await this.writeCache(this.catalog)
      return this.catalog
    } catch (error) {
      this.metadataRefreshPending = true
      if (this.catalog) {
        this.catalog = this.createCatalog(this.catalog)
        await this.writeCache(this.catalog)
      }
      throw error
    }
  }

  private scheduleDailySync(): void {
    const now = new Date()
    const nextMidnight = new Date(now)
    nextMidnight.setHours(24, 0, 0, 0)
    const delay = Math.max(nextMidnight.getTime() - now.getTime(), 1000)

    const syncTimer = setTimeout(async () => {
      try {
        await this.sync()
      } catch (error) {
        console.error('[catalog] daily catalog sync failed', error)
      } finally {
        this.scheduleDailySync()
      }
    }, delay)
    syncTimer.unref()
  }

  private scheduleGroupSync(): void {
    const timer = setInterval(async () => {
      try {
        await this.syncGroups()
      } catch (error) {
        console.error('[catalog] periodic Sub2API group sync failed', error)
      }
    }, 5 * 60 * 1000)
    timer.unref()
  }

  private async syncGroups(): Promise<void> {
    if (!this.hasSub2Api) return
    if (this.syncPromise) {
      await this.syncPromise
      return
    }
    if (this.groupSyncPromise) return this.groupSyncPromise

    this.groupSyncPromise = (async () => {
      const previousModelIds = this.modelIds
      const { modelIds } = await this.refreshSub2ApiState()
      const modelsChanged = !sameModelIds(previousModelIds, modelIds)
      const metadataRefreshNeeded = !this.catalog || modelsChanged || this.metadataRefreshPending
      let nextCatalog: CatalogResponse

      if (metadataRefreshNeeded) {
        this.metadataRefreshPending = true
        const upstream = await fetchModelsDev(AbortSignal.timeout(30_000))
        nextCatalog = this.createCatalog(normalizeCatalog(upstream, modelIds))
        this.metadataRefreshPending = false
      } else {
        nextCatalog = this.createCatalog(this.catalog!)
      }
      this.catalog = nextCatalog
      await this.writeCache(nextCatalog)
    })().catch(async (error) => {
      if (this.catalog) {
        this.catalog = this.createCatalog(this.catalog)
        await this.writeCache(this.catalog)
      }
      throw error
    }).finally(() => {
      this.groupSyncPromise = undefined
    })
    return this.groupSyncPromise
  }

  private async refreshSub2ApiState(): Promise<{ modelIds: string[] }> {
    const groups = await fetchSub2ApiGroups(
      this.options.sub2ApiUrl!,
      this.options.sub2ApiAdminApiKey!,
      AbortSignal.timeout(30_000),
    )
    this.groups = groups
    this.modelIds = collectAvailableModelIds(groups)
    return { modelIds: this.modelIds }
  }

  private createCatalog(baseCatalog: CatalogResponse): CatalogResponse {
    return {
      ...baseCatalog,
      groups: this.groups.map(({ models, ...group }) => group),
      models: attachGroupPricing(baseCatalog.models, this.groups),
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const cached = JSON.parse(await readFile(this.options.cacheFile, 'utf8')) as CatalogResponse
      if (cached.version !== 7) return
      this.catalog = cached
      this.modelIds = cached.models.map((model) => model.id)
      this.groups = (cached.groups ?? []).map((group) => ({
        ...group,
        models: cached.models
          .filter((model) => model.groupPricing?.some((item) => item.groupId === group.id))
          .map((model) => model.id),
      }))
    } catch {
      // The first successful upstream sync creates the cache.
    }
  }

  private async writeCache(catalog: CatalogResponse): Promise<void> {
    const cacheFile = resolve(this.options.cacheFile)
    const temporary = `${cacheFile}.tmp`
    await mkdir(dirname(cacheFile), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    await rename(temporary, cacheFile)
  }

  private requireSub2Api(): void {
    if (!this.hasSub2Api) throw new Error('SUB2API_URL and SUB2API_ADMIN_API_KEY are required')
  }

  private get hasSub2Api(): boolean {
    return Boolean(this.options.sub2ApiUrl && this.options.sub2ApiAdminApiKey)
  }
}

function sameModelIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((model, index) => model === right[index])
}
