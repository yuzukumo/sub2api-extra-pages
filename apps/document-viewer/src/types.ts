export type UiLocale = 'en-US' | 'zh-CN' | 'zh-TW' | 'ru-RU'

export interface DocumentManifestItem {
  file: string
}

export interface DocumentManifest {
  title?: Record<UiLocale, string>
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
