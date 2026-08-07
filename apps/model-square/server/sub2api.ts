import type {
  CatalogGroup,
  CatalogGroupPricing,
  CatalogModel,
  CatalogPricing,
  CatalogPricingTier,
  CatalogRateHistoryPoint,
} from './types.js'

export const RATE_HISTORY_MAX_SNAPSHOTS = 180 * 24 * 6

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
  status?: string
  schedulable?: boolean
  group_ids?: Array<number | string>
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
    platform: String(group.platform ?? 'unknown').trim() || 'unknown',
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
  const eligibleAccounts = accounts.filter((account) =>
    isActiveSchedulableAccount(account) && accountGroupIds(account).some((groupId) => groupIds.has(groupId)),
  )
  const accountModels = await mapWithConcurrency(eligibleAccounts, 8, async (account) => ({
    account,
    models: await fetchSub2ApiAccountModels(baseUrl, adminApiKey, accountId(account), signal),
  }))
  const modelsByGroup = new Map(groups.map((group) => [group.id, new Set<string>()]))

  for (const { account, models } of accountModels) {
    for (const groupId of accountGroupIds(account)) {
      const groupModels = modelsByGroup.get(groupId)
      if (!groupModels) continue
      for (const model of models) groupModels.add(model)
    }
  }

  return groups.flatMap((group) => {
    const models = modelsByGroup.get(group.id)
    if (!models?.size) return []
    return [{
      ...group,
      models: [...models].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' })),
    }]
  })
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

function isActiveSchedulableAccount(account: Sub2ApiAccount): boolean {
  return String(account.status ?? '').trim().toLowerCase() === 'active' && account.schedulable === true
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
