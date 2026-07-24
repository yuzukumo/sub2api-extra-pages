export const uiLocales = ['en-US', 'zh-CN', 'zh-TW', 'ru-RU'] as const

export type UiLocale = (typeof uiLocales)[number]

export interface DocumentManifestItem {
  file: string
}

export interface DocumentManifest {
  title?: Partial<Record<UiLocale, string>>
  documents: DocumentManifestItem[]
}

export interface NavigationItem extends DocumentManifestItem {
  title: string
}

export interface NavigationPayload {
  title?: string
  documents: NavigationItem[]
}

export interface DocumentPayload {
  file: string
  content: string
  assetBase: string
}
