import { describe, expect, it } from 'vitest'
import { messages } from './i18n'
import { resolveBrowserLocale } from './hooks/useLocalePreference'

describe('i18n', () => {
  it('uses the first supported browser language', () => {
    expect(resolveBrowserLocale(['zh-TW', 'en-US'])).toBe('zh-TW')
    expect(resolveBrowserLocale(['zh-Hant-TW', 'en-US'])).toBe('zh-TW')
    expect(resolveBrowserLocale(['zh-CN', 'en-US'])).toBe('zh-CN')
    expect(resolveBrowserLocale(['ru-RU', 'en-US'])).toBe('ru-RU')
    expect(resolveBrowserLocale(['fr-FR', 'en-GB'])).toBe('en-US')
  })

  it('defaults to English when no browser language is supported', () => {
    expect(resolveBrowserLocale(['de-DE', 'fr-FR'])).toBe('en-US')
    expect(resolveBrowserLocale([])).toBe('en-US')
  })

  it('contains translated capability labels', () => {
    expect(messages['en-US'].capabilities.toolCall).toBe('Tool calling')
    expect(messages['zh-CN'].capabilities.toolCall).toBe('工具调用')
  })

  it('contains translated theme controls', () => {
    expect(messages['en-US'].themeSystem).toBe('Follow system')
    expect(messages['zh-CN'].themeDark).toBe('深色')
    expect(messages['zh-TW'].themeDark).toBe('深色')
    expect(messages['zh-TW'].cacheRead).toBe('快取讀取')
  })
})
