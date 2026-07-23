export interface CardGridLayout {
  columns: number
  gridWidth: number
  cardWidth: number
}

export interface CardGridOptions {
  gap: number
  minCardWidth?: number
  maxCardWidth?: number
  maxColumns?: number
}

const DEFAULT_MIN_CARD_WIDTH = 320
const DEFAULT_MAX_CARD_WIDTH = 360
const DEFAULT_MAX_COLUMNS = 5

export function getCardGridLayout(
  availableWidth: number,
  {
    gap,
    minCardWidth = DEFAULT_MIN_CARD_WIDTH,
    maxCardWidth = DEFAULT_MAX_CARD_WIDTH,
    maxColumns = DEFAULT_MAX_COLUMNS,
  }: CardGridOptions,
): CardGridLayout {
  const width = Math.max(0, availableWidth)
  const columns = Math.min(
    maxColumns,
    Math.max(1, Math.floor((width + gap) / (minCardWidth + gap))),
  )
  const maxGridWidth = columns * maxCardWidth + (columns - 1) * gap
  const gridWidth = Math.min(width, maxGridWidth)
  const cardWidth = Math.max(0, (gridWidth - (columns - 1) * gap) / columns)

  return { columns, gridWidth, cardWidth }
}
