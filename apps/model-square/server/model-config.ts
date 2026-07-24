export function parseModelIds(value: string | undefined): string[] {
  return [...new Set((value ?? '')
    .split(/[\n,]/)
    .map((id) => id.trim())
    .filter(Boolean))]
}

export function resolveModelIds(
  value: string | undefined,
  preserveInputOrder: string | undefined,
): string[] {
  const modelIds = parseModelIds(value)
  if (preserveInputOrder?.trim().toLowerCase() === 'true') return modelIds

  return modelIds.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}
