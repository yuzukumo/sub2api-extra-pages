import type {
  CatalogFilters,
  CatalogModel,
  ModelCatalog,
} from '../types/catalog'

export function getProviders(models: CatalogModel[]): string[] {
  return [...new Set(models.map((model) => model.provider))].sort((a, b) =>
    a.localeCompare(b),
  )
}

export function filterModels(
  models: CatalogModel[],
  filters: CatalogFilters,
): CatalogModel[] {
  const query = filters.query.trim().toLocaleLowerCase()

  return models.filter((model) => {
    if (filters.provider && model.provider !== filters.provider) return false
    if (!query) return true

    const searchable = [
      model.name,
      model.id,
      model.provider,
      model.description ?? '',
      ...model.capabilities,
    ]
      .join(' ')
      .toLocaleLowerCase()

    return searchable.includes(query)
  })
}

export function sortModelsById(models: CatalogModel[]): CatalogModel[] {
  return [...models].sort((a, b) =>
    a.id.localeCompare(b.id, 'en', { sensitivity: 'base' }),
  )
}

export function formatTokenCount(value?: number): string {
  if (!value) return '-'
  if (value >= 1_000_000) return `${value / 1_000_000}M`
  if (value >= 1_000) return `${value / 1_000}K`
  return String(value)
}

export function formatPrice(
  value: number | undefined,
  catalog: Pick<ModelCatalog, 'currency' | 'priceUnit'>,
): string {
  if (value === undefined) return '-'
  const symbol = catalog.currency === 'CNY' ? '¥' : '$'
  const amount = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(value)
  return `${symbol}${amount}`
}

export function formatPriceUnit(): string {
  return '/1M'
}
