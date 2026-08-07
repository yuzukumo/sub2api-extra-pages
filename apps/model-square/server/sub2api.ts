import type {
  CatalogGroup,
  CatalogGroupPricing,
  CatalogModel,
  CatalogPricing,
  CatalogPricingTier,
  CatalogRateHistoryPoint,
} from './types.js'

export const RATE_HISTORY_MAX_SNAPSHOTS = 180 * 24 * 6

const COMPOSITE_PLATFORMS = ['anthropic', 'gemini', 'openai', 'antigravity', 'grok'] as const
const DEFAULT_MAPPING_PLATFORMS = new Set(['antigravity', 'grok'])

interface Sub2ApiGroup {
  id?: number | string
  name?: string
  platform?: string
  status?: string
  is_exclusive?: unknown
  rate_multiplier?: number
}

interface Sub2ApiGroupsResponse {
  data?: {
    items?: Sub2ApiGroup[]
    pages?: number
  }
}

interface Sub2ApiAccount {
  id?: number | string
  platform?: string
  status?: string
  schedulable?: boolean
  group_ids?: Array<number | string>
  expires_at?: number | string | null
  auto_pause_on_expired?: boolean
  rate_limit_reset_at?: string | number | null
  overload_until?: string | number | null
  temp_unschedulable_until?: string | number | null
  credentials?: {
    model_mapping?: unknown
  }
}

interface Sub2ApiAccountsResponse {
  data?: {
    items?: Sub2ApiAccount[]
    pages?: number
  }
}

interface Sub2ApiAccountModelsResponse {
  data?: Array<string | { id?: string }>
}

export interface ResolvedSub2ApiGroup extends CatalogGroup {
  models: string[]
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function normalizeGroup(group: Sub2ApiGroup): ResolvedSub2ApiGroup | undefined {
  const id = String(group.id ?? '').trim()
  const name = String(group.name ?? '').trim()
  if (!id || !name) return undefined
  const rateMultiplier = finiteNonNegative(group.rate_multiplier)
  if (rateMultiplier === undefined) return undefined
  return {
    id,
    name,
    platform: normalizePlatform(group.platform) || 'unknown',
    rateMultiplier,
    status: String(group.status ?? '').trim().toLowerCase() || undefined,
    models: [],
  }
}

function isExclusiveGroup(group: Sub2ApiGroup): boolean {
  return group.is_exclusive === true || group.is_exclusive === 1 || group.is_exclusive === 'true'
}

export async function fetchSub2ApiGroups(
  baseUrl: string,
  adminApiKey: string,
  signal?: AbortSignal,
): Promise<ResolvedSub2ApiGroup[]> {
  const groups = await fetchActiveGroups(baseUrl, adminApiKey, signal)
  const groupIds = new Set(groups.map((group) => group.id))
  const accounts = await fetchActiveAccounts(baseUrl, adminApiKey, signal)
  const syncStartedAt = Date.now()
  const eligibleAccounts = accounts.filter((account) =>
    isActiveSchedulableAccount(account, syncStartedAt) && accountGroupIds(account).some((groupId) => groupIds.has(groupId)),
  )
  const fallbackModelsByAccount = new Map<string, Promise<string[]>>()
  const fallbackModels = (account: Sub2ApiAccount): Promise<string[]> => {
    const id = accountId(account)
    let models = fallbackModelsByAccount.get(id)
    if (!models) {
      models = fetchSub2ApiAccountModels(baseUrl, adminApiKey, id, signal)
      fallbackModelsByAccount.set(id, models)
    }
    return models
  }

  const resolvedGroups = await mapWithConcurrency(groups, 8, async (group) => {
    const models = await resolveGroupModels(group, eligibleAccounts, fallbackModels)
    if (!models.length) return undefined
    return { ...group, models }
  })
  return resolvedGroups.filter((group): group is ResolvedSub2ApiGroup => group !== undefined)
}

async function resolveGroupModels(
  group: ResolvedSub2ApiGroup,
  accounts: Sub2ApiAccount[],
  fallbackModels: (account: Sub2ApiAccount) => Promise<string[]>,
): Promise<string[]> {
  const groupAccounts = accounts.filter((account) => accountGroupIds(account).includes(group.id))
  if (group.platform === 'composite') {
    const byPlatform = await Promise.all(COMPOSITE_PLATFORMS.map((platform) =>
      resolvePlatformModels(platform, groupAccounts.filter((account) => accountPlatform(account) === platform), fallbackModels),
    ))
    return sortModelIds(byPlatform.flat())
  }
  return resolvePlatformModels(
    group.platform,
    groupAccounts.filter((account) => accountPlatform(account) === group.platform),
    fallbackModels,
  )
}

async function resolvePlatformModels(
  platform: string,
  accounts: Sub2ApiAccount[],
  fallbackModels: (account: Sub2ApiAccount) => Promise<string[]>,
): Promise<string[]> {
  const mappedModelsByAccount = accounts.map((account) => ({ account, models: accountModelMappingIds(account) }))
  const mappedAccounts = mappedModelsByAccount.filter(({ models }) => models.length > 0)
  if (mappedAccounts.length === 0) {
    return accounts[0] ? sortModelIds(await fallbackModels(accounts[0])) : []
  }

  const models = mappedAccounts.flatMap(({ models }) => models)
  // Grok and Antigravity turn an omitted mapping into a platform default mapping.
  if (DEFAULT_MAPPING_PLATFORMS.has(platform)) {
    const defaultAccount = mappedModelsByAccount.find(({ models }) => models.length === 0)?.account
    if (defaultAccount) models.push(...await fallbackModels(defaultAccount))
  }
  return sortModelIds(models)
}

async function fetchActiveGroups(
  baseUrl: string,
  adminApiKey: string,
  signal?: AbortSignal,
): Promise<ResolvedSub2ApiGroup[]> {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/v1/admin/groups`
  const result: ResolvedSub2ApiGroup[] = []
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`${root}?page=${page}&page_size=1000`, {
      headers: {
        Accept: 'application/json',
        'x-api-key': adminApiKey,
        'User-Agent': 'sub2api-model-square/0.2',
      },
      signal,
    })
    if (!response.ok) throw new Error(`Sub2API groups returned ${response.status}`)
    const payload = await response.json() as Sub2ApiGroupsResponse
    const items = payload.data?.items
    if (!Array.isArray(items)) throw new Error('Sub2API groups response has no data.items')
    result.push(...items
      .filter((group) => !isExclusiveGroup(group))
      .map(normalizeGroup)
      .filter((group): group is ResolvedSub2ApiGroup => group !== undefined)
      .filter((group) => !group.status || group.status === 'active'))
    if (page >= (payload.data?.pages ?? 1)) break
  }
  return result
}

async function fetchActiveAccounts(
  baseUrl: string,
  adminApiKey: string,
  signal?: AbortSignal,
): Promise<Sub2ApiAccount[]> {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/v1/admin/accounts`
  const result: Sub2ApiAccount[] = []
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`${root}?page=${page}&page_size=1000&status=active`, {
      headers: {
        Accept: 'application/json',
        'x-api-key': adminApiKey,
        'User-Agent': 'sub2api-model-square/0.2',
      },
      signal,
    })
    if (!response.ok) throw new Error(`Sub2API accounts returned ${response.status}`)
    const payload = await response.json() as Sub2ApiAccountsResponse
    const items = payload.data?.items
    if (!Array.isArray(items)) throw new Error('Sub2API accounts response has no data.items')
    result.push(...items)
    if (page >= (payload.data?.pages ?? 1)) break
  }
  return result
}

async function fetchSub2ApiAccountModels(
  baseUrl: string,
  adminApiKey: string,
  accountID: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const root = baseUrl.replace(/\/+$/, '')
  const response = await fetch(`${root}/api/v1/admin/accounts/${encodeURIComponent(accountID)}/models`, {
    headers: {
      Accept: 'application/json',
      'x-api-key': adminApiKey,
      'User-Agent': 'sub2api-model-square/0.2',
    },
    signal,
  })
  if (!response.ok) throw new Error(`Sub2API account models returned ${response.status}`)
  const payload = await response.json() as Sub2ApiAccountModelsResponse
  if (!Array.isArray(payload.data)) throw new Error('Sub2API account models response has no data array')
  return [...new Set(payload.data
    .map((model) => typeof model === 'string' ? model : model?.id)
    .map((model) => String(model ?? '').trim())
    .filter(Boolean))]
}

function accountId(account: Sub2ApiAccount): string {
  const id = String(account.id ?? '').trim()
  if (!id) throw new Error('Sub2API account response has no id')
  return id
}

function accountGroupIds(account: Sub2ApiAccount): string[] {
  if (!Array.isArray(account.group_ids)) return []
  return [...new Set(account.group_ids.map((groupId) => String(groupId).trim()).filter(Boolean))]
}

function accountPlatform(account: Sub2ApiAccount): string {
  return normalizePlatform(account.platform)
}

function accountModelMappingIds(account: Sub2ApiAccount): string[] {
  const mapping = account.credentials?.model_mapping
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return []
  return Object.entries(mapping)
    .filter(([, target]) => typeof target === 'string')
    .map(([model]) => model.trim())
    .filter(Boolean)
}

function normalizePlatform(platform: unknown): string {
  return String(platform ?? '').trim().toLowerCase()
}

function isActiveSchedulableAccount(account: Sub2ApiAccount, now: number): boolean {
  return String(account.status ?? '').trim().toLowerCase() === 'active'
    && account.schedulable === true
    && !isFutureTimestamp(account.temp_unschedulable_until, now)
    && !isFutureTimestamp(account.overload_until, now)
    && !isFutureTimestamp(account.rate_limit_reset_at, now)
    && !(account.auto_pause_on_expired === true && isPastTimestamp(account.expires_at, now))
}

function isFutureTimestamp(value: unknown, now: number): boolean {
  const timestamp = parseTimestamp(value)
  return timestamp !== undefined && timestamp > now
}

function isPastTimestamp(value: unknown, now: number): boolean {
  const timestamp = parseTimestamp(value)
  return timestamp !== undefined && timestamp <= now
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 100_000_000_000 ? value : value * 1000
  }
  if (typeof value !== 'string' || !value.trim()) return undefined
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric > 100_000_000_000 ? numeric : numeric * 1000
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function sortModelIds(models: string[]): string[] {
  return [...new Set(models)].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

export function collectAvailableModelIds(groups: ResolvedSub2ApiGroup[]): string[] {
  return [...new Set(groups.flatMap((group) => group.models))]
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
}

function multiplyPrice(value: number | undefined, multiplier: number): number | undefined {
  return value === undefined ? undefined : value * multiplier
}

export function multiplyPricing(
  pricing: CatalogPricing & { tiers?: CatalogPricingTier[] },
  multiplier: number,
): CatalogPricing & { tiers?: CatalogPricingTier[] } {
  const result: CatalogPricing & { tiers?: CatalogPricingTier[] } = {
    input: multiplyPrice(pricing.input, multiplier),
    output: multiplyPrice(pricing.output, multiplier),
    cacheRead: multiplyPrice(pricing.cacheRead, multiplier),
    cacheWrite: multiplyPrice(pricing.cacheWrite, multiplier),
  }
  if (pricing.tiers) {
    result.tiers = pricing.tiers.map((tier) => ({
      contextWindow: tier.contextWindow,
      pricing: multiplyPricing(tier.pricing, multiplier),
    }))
  }
  return result
}

function modelIsInGroup(model: CatalogModel, group: ResolvedSub2ApiGroup): boolean {
  return group.models.includes(model.id)
}

function withGroupPricing(
  model: CatalogModel,
  groupPricing: CatalogGroupPricing[],
): CatalogModel {
  if (groupPricing.length > 0) return { ...model, groupPricing }
  const { groupPricing: _groupPricing, ...modelWithoutGroupPricing } = model
  return modelWithoutGroupPricing
}

export function attachGroupPricing(
  models: CatalogModel[],
  groups: ResolvedSub2ApiGroup[],
): CatalogModel[] {
  return models.map((model) => {
    const groupPricing: CatalogGroupPricing[] = groups
      .filter((group) => modelIsInGroup(model, group))
      .map((group) => ({
        groupId: group.id,
        pricing: multiplyPricing(model.pricing, group.rateMultiplier),
      }))
    return withGroupPricing(model, groupPricing)
  })
}

export function appendRateHistory(
  history: CatalogRateHistoryPoint[],
  groups: ResolvedSub2ApiGroup[],
  date: string,
  recordedAt = new Date().toISOString(),
): CatalogRateHistoryPoint[] {
  const point: CatalogRateHistoryPoint = {
    date,
    recordedAt,
    groups: groups.map((group) => ({ groupId: group.id, multiplier: group.rateMultiplier })),
  }
  return [...history, point]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .slice(-RATE_HISTORY_MAX_SNAPSHOTS)
}
