import { describe, expect, it } from 'vitest'
import { resolveModelIds } from './model-config'

describe('model configuration', () => {
  it('sorts configured model IDs alphabetically by default', () => {
    expect(resolveModelIds('model-z, Model-A\nmodel-b, model-z', undefined)).toEqual([
      'Model-A',
      'model-b',
      'model-z',
    ])
  })

  it('preserves the configured model ID order when enabled', () => {
    expect(resolveModelIds('model-z, Model-A\nmodel-b, model-z', 'true')).toEqual([
      'model-z',
      'Model-A',
      'model-b',
    ])
  })
})
