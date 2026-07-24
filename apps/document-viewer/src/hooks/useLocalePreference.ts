import { useCallback, useEffect, useState } from 'react'
import { detectLocale, resolveAvailableLocale } from '../i18n'
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

export function useLocalePreference(
  availableLocales?: readonly UiLocale[],
): [UiLocale, (locale: UiLocale) => void] {
  const [preferredLocale, setPreferredLocale] = useState<UiLocale>(() => {
    const stored = readStoredLocale()
    if (stored) return stored
    return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
  })
  const locale = availableLocales
    ? resolveAvailableLocale(preferredLocale, availableLocales)
    : preferredLocale

  const updateLocale = useCallback((nextLocale: UiLocale) => {
    setPreferredLocale(nextLocale)
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
