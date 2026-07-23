import { describe, expect, it } from 'vitest'
import { detectLocale } from './i18n'

describe('detectLocale', () => {
  it('selects supported Chinese variants and defaults to English', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh-CN')
    expect(detectLocale(['zh-Hant-TW'])).toBe('zh-TW')
    expect(detectLocale(['ru-RU'])).toBe('ru-RU')
    expect(detectLocale(['fr-FR'])).toBe('en-US')
  })
})
