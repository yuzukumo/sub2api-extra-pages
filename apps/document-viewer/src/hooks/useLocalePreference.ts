import { useCallback, useEffect, useState } from 'react'
import { detectLocale } from '../i18n'
import type { UiLocale } from '../types'

const STORAGE_KEY = 'sub2api-document-viewer.locale'

function readStoredLocale(): UiLocale | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'en-US' || value === 'zh-CN' || value === 'zh-TW' || value === 'ru-RU'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

export function useLocalePreference(): [UiLocale, (locale: UiLocale) => void] {
  const [locale, setLocale] = useState<UiLocale>(() => {
    const stored = readStoredLocale()
    if (stored) return stored
    return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
  })

  const updateLocale = useCallback((nextLocale: UiLocale) => {
    setLocale(nextLocale)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLocale)
    } catch {
      // Blocked storage should not prevent language switching.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return [locale, updateLocale]
}
