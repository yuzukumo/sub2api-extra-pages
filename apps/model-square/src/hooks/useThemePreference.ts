import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'sub2api-model-square.theme'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function resolveInitialThemePreference(
  stored: string | null,
  queryTheme: string | null,
): ThemePreference {
  if (isThemePreference(stored)) return stored
  if (queryTheme === 'light' || queryTheme === 'dark') return queryTheme
  return 'system'
}

function readInitialPreference(): ThemePreference {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Blocked storage should not prevent system theme detection.
  }
  const queryTheme = new URLSearchParams(window.location.search).get('theme')
  return resolveInitialThemePreference(stored, queryTheme)
}

function readSystemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(readInitialPreference)
  const [systemDark, setSystemDark] = useState(readSystemDark)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return

    const updateSystemTheme = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(media.matches)
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  const updatePreference = useCallback((nextPreference: ThemePreference) => {
    setPreference(nextPreference)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPreference)
    } catch {
      // Private browsing and blocked storage should not break theme switching.
    }
  }, [])

  const dark = preference === 'system' ? systemDark : preference === 'dark'

  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  return [preference, updatePreference, dark] as const
}
