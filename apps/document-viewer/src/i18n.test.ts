import { describe, expect, it } from 'vitest'
import { detectLocale, getAvailableLocales, resolveAvailableLocale } from './i18n'

describe('detectLocale', () => {
  it('selects supported Chinese variants and defaults to English', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh-CN')
    expect(detectLocale(['zh-Hant-TW'])).toBe('zh-TW')
    expect(detectLocale(['ru-RU'])).toBe('ru-RU')
    expect(detectLocale(['fr-FR'])).toBe('en-US')
  })

  it('uses only locales configured in the manifest and has a stable fallback', () => {
    expect(getAvailableLocales({
      'en-US': 'Documentation',
      'zh-CN': '服务文档',
    })).toEqual(['en-US', 'zh-CN'])
    expect(getAvailableLocales()).toEqual(['en-US'])
    expect(resolveAvailableLocale('ru-RU', ['en-US', 'zh-CN'])).toBe('en-US')
    expect(resolveAvailableLocale('ru-RU', ['zh-CN'])).toBe('zh-CN')
  })
})
