import { describe, expect, it } from 'vitest'
import { getCardGridLayout } from './cardGrid'

const gap = 12

describe('getCardGridLayout', () => {
  it('uses five fluid columns while cards fit between their minimum and maximum widths', () => {
    const layout = getCardGridLayout(1700, { gap })

    expect(layout.columns).toBe(5)
    expect(layout.cardWidth).toBeCloseTo(330.4)
    expect(layout.gridWidth).toBe(1700)
  })

  it('centers a full-width four-column grid once five minimum cards no longer fit', () => {
    const layout = getCardGridLayout(1600, { gap })

    expect(layout.columns).toBe(4)
    expect(layout.cardWidth).toBe(360)
    expect(layout.gridWidth).toBe(1476)
  })

  it('keeps a single narrow card inside a small embedded viewport', () => {
    const layout = getCardGridLayout(280, { gap })

    expect(layout.columns).toBe(1)
    expect(layout.cardWidth).toBe(280)
    expect(layout.gridWidth).toBe(280)
  })
})
