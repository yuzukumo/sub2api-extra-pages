import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fetchModelsDev, normalizeCatalog } from './models-dev.js'
import type { CatalogResponse } from './types.js'

export interface CatalogServiceOptions {
  cacheFile: string
  modelIds: string[]
}

export class CatalogService {
  private catalog?: CatalogResponse
  private syncPromise?: Promise<CatalogResponse>

  constructor(private readonly options: CatalogServiceOptions) {}

  async initialize(): Promise<void> {
    try {
      const cached = JSON.parse(await readFile(this.options.cacheFile, 'utf8')) as CatalogResponse
      const cachedIds = cached.models?.map((model) => model.id)
      const matchesConfiguration = cached.version === 2 &&
        cachedIds?.length === this.options.modelIds.length &&
        cachedIds.every((id, index) => id === this.options.modelIds[index])
      if (matchesConfiguration) this.catalog = cached
    } catch {
      // The first successful upstream sync creates the cache.
    }

    let startupError: unknown
    try {
      await this.sync()
    } catch (error) {
      startupError = error
    }
    this.scheduleDailySync()
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
    const signal = AbortSignal.timeout(30_000)
    const upstream = await fetchModelsDev(signal)
    const catalog = normalizeCatalog(upstream, this.options.modelIds)
    this.catalog = catalog
    await this.writeCache(catalog)
    return catalog
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
        console.error('[catalog] daily models.dev sync failed', error)
      } finally {
        this.scheduleDailySync()
      }
    }, delay)
    syncTimer.unref()
  }

  private async writeCache(catalog: CatalogResponse): Promise<void> {
    const cacheFile = resolve(this.options.cacheFile)
    const temporary = `${cacheFile}.tmp`
    await mkdir(dirname(cacheFile), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    await rename(temporary, cacheFile)
  }
}
