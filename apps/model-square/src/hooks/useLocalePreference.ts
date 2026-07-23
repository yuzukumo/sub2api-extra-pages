import { useCallback, useEffect, useState } from 'react'
import type { Locale } from '../types/catalog'

const STORAGE_KEY = 'sub2api-model-square.locale'

export function resolveBrowserLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const normalized = language.toLowerCase().replaceAll('_', '-')
    if (normalized.startsWith('zh')) {
      if (normalized.includes('-tw') || normalized.includes('hant')) return 'zh-TW'
      return 'zh-CN'
    }
    if (normalized.startsWith('en')) return 'en-US'
    if (normalized.startsWith('ru')) return 'ru-RU'
  }
  return 'en-US'
}

function readStoredLocale(): Locale | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'zh-CN' || value === 'zh-TW' || value === 'en-US' || value === 'ru-RU'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export function useLocalePreference(): [Locale, (locale: Locale) => void] {
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = readStoredLocale()
    if (stored) return stored
    return resolveBrowserLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
  })

  const updateLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLocale)
    } catch {
      // Private browsing and blocked storage should not break language switching.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return [locale, updateLocale]
}
