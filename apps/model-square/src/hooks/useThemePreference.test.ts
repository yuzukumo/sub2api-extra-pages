import { describe, expect, it } from 'vitest'
import { resolveInitialThemePreference } from './useThemePreference'

describe('theme preference', () => {
  it('defaults to following the system', () => {
    expect(resolveInitialThemePreference(null, null)).toBe('system')
  })

  it('uses the URL theme as the initial preference', () => {
    expect(resolveInitialThemePreference(null, 'dark')).toBe('dark')
    expect(resolveInitialThemePreference(null, 'light')).toBe('light')
  })

  it('keeps a manually stored preference ahead of the URL default', () => {
    expect(resolveInitialThemePreference('system', 'dark')).toBe('system')
    expect(resolveInitialThemePreference('light', 'dark')).toBe('light')
  })
})
