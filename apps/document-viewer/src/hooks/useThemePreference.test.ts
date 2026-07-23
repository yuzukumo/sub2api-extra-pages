import { describe, expect, it } from 'vitest'
import { resolveInitialThemePreference } from './useThemePreference'

describe('resolveInitialThemePreference', () => {
  it('uses saved preference before the query string', () => {
    expect(resolveInitialThemePreference('dark', 'light')).toBe('dark')
  })

  it('uses a valid query string when no preference is saved', () => {
    expect(resolveInitialThemePreference(null, 'light')).toBe('light')
    expect(resolveInitialThemePreference(null, null)).toBe('system')
  })
})
