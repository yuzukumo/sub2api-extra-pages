import type {
  CatalogModel,
  CatalogPricing,
  CatalogPricingTier,
  CatalogResponse,
  ModelsDevModel,
  ModelsDevProvider,
  ModelsDevResponse,
} from './types.js'

const MODELS_DEV_URL = 'https://models.dev/api.json'

const providerRules = [
  { test: /^(gpt-|chatgpt-|o[1345](?:-|$)|text-embedding-)/i, provider: 'openai', name: 'OpenAI', icon: 'openai' },
  { test: /^claude-/i, provider: 'anthropic', name: 'Anthropic', icon: 'claude' },
  { test: /^(gemini-|gemma-)/i, provider: 'google', name: 'Google', icon: 'gemini' },
  { test: /^deepseek-/i, provider: 'deepseek', name: 'DeepSeek', icon: 'deepseek' },
  { test: /^grok-/i, provider: 'xai', name: 'xAI', icon: 'grok' },
  { test: /^(mistral-|ministral-|codestral-)/i, provider: 'mistral', name: 'Mistral AI', icon: 'mistral' },
  { test: /^(qwen|qwq-)/i, provider: 'alibaba', name: 'Alibaba Cloud', icon: 'qwen' },
  { test: /^llama-/i, provider: 'meta', name: 'Meta', icon: 'meta' },
] as const

interface Candidate {
  providerKey: string
  provider: ModelsDevProvider
  model: ModelsDevModel
}

function inferRule(modelId: string) {
  return providerRules.find((rule) => rule.test.test(modelId))
}

function candidateScore(candidate: Candidate, modelId: string): number {
  const rule = inferRule(modelId)
  const providerKey = (candidate.provider.id || candidate.providerKey).toLowerCase()
  let score = 0
  if (rule && providerKey === rule.provider) score += 1000
  if (candidate.model.cost?.input !== undefined) score += 100
  if (candidate.model.cost?.output !== undefined) score += 100
  if (candidate.model.limit?.context) score += 20
  if (candidate.model.description) score += 10
  if (candidate.model.family) score += 5
  if (candidate.model.reasoning_options?.length) score += 3
  return score
}

export function findModelCandidate(data: ModelsDevResponse, modelId: string): Candidate | undefined {
  const candidates: Candidate[] = []
  for (const [providerKey, provider] of Object.entries(data)) {
    const models = provider.models ?? {}
    for (const [key, model] of Object.entries(models)) {
      if (key === modelId || model.id === modelId) {
        candidates.push({ providerKey, provider, model })
      }
    }
  }
  return candidates.sort((a, b) => candidateScore(b, modelId) - candidateScore(a, modelId))[0]
}

function capabilityKeys(model: ModelsDevModel): string[] {
  const values = new Set<string>()
  for (const modality of model.modalities?.input ?? []) {
    const key = { text: 'text', image: 'vision', audio: 'audio', video: 'video', pdf: 'file' }[modality]
    if (key) values.add(key)
  }
  if (model.reasoning) values.add('reasoning')
  if (model.tool_call) values.add('toolCall')
  if (model.structured_output) values.add('structuredOutput')
  if (model.open_weights) values.add('openWeights')
  return [...values]
}

function resolveIcon(modelId: string, candidate: Candidate): string {
  const rule = inferRule(modelId)
  if (rule) return rule.icon
  const source = `${candidate.provider.id} ${candidate.providerKey} ${candidate.model.family}`.toLowerCase()
  for (const item of providerRules) {
    if (source.includes(item.provider)) return item.icon
  }
  return 'generic'
}

function resolveProviderName(modelId: string, candidate: Candidate): string {
  return inferRule(modelId)?.name ||
    candidate.provider.name ||
    candidate.provider.id ||
    candidate.providerKey
}

function positiveNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

function nonNegativeNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined
  return value
}

function hasPricing(pricing: CatalogPricing): boolean {
  return Object.values(pricing).some((value) => value !== undefined)
}

function normalizePricing(model: ModelsDevModel): CatalogModel['pricing'] {
  const pricing: CatalogPricing = {
    input: nonNegativeNumber(model.cost?.input),
    output: nonNegativeNumber(model.cost?.output),
    cacheRead: nonNegativeNumber(model.cost?.cache_read),
    cacheWrite: nonNegativeNumber(model.cost?.cache_write),
  }
  const tiers: CatalogPricingTier[] = (model.cost?.tiers ?? [])
    .map((tier) => {
      if (tier.tier?.type !== 'context') return undefined
      const contextWindow = positiveNumber(tier.tier.size)
      if (!contextWindow) return undefined

      const tierPricing: CatalogPricing = {
        input: nonNegativeNumber(tier.input),
        output: nonNegativeNumber(tier.output),
        cacheRead: nonNegativeNumber(tier.cache_read),
        cacheWrite: nonNegativeNumber(tier.cache_write),
      }
      if (!hasPricing(tierPricing)) return undefined

      return { contextWindow, pricing: tierPricing }
    })
    .filter((tier): tier is CatalogPricingTier => tier !== undefined)
    .sort((a, b) => a.contextWindow - b.contextWindow)

  return tiers.length > 0 ? { ...pricing, tiers } : pricing
}

export function normalizeCatalog(
  data: ModelsDevResponse,
  modelIds: string[],
): CatalogResponse {
  const models: CatalogModel[] = modelIds.map((modelId) => {
    const candidate = findModelCandidate(data, modelId)
    if (!candidate) {
      return {
        id: modelId,
        name: modelId,
        provider: 'unknown',
        icon: 'generic',
        capabilities: [],
        pricing: {},
      }
    }

    const { model } = candidate
    return {
      id: modelId,
      name: model.name || modelId,
      provider: resolveProviderName(modelId, candidate),
      icon: resolveIcon(modelId, candidate),
      description: model.description?.trim() || undefined,
      capabilities: capabilityKeys(model),
      contextWindow: positiveNumber(model.limit?.context),
      maxOutput: positiveNumber(model.limit?.output),
      pricing: normalizePricing(model),
    }
  })

  return {
    version: 6,
    updatedAt: formatLocalDate(new Date()),
    currency: 'USD',
    priceUnit: 'MTok',
    models,
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function fetchModelsDev(signal?: AbortSignal): Promise<ModelsDevResponse> {
  const response = await fetch(MODELS_DEV_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'sub2api-model-square/0.1' },
    signal,
  })
  if (!response.ok) throw new Error(`models.dev returned ${response.status}`)
  return response.json() as Promise<ModelsDevResponse>
}
