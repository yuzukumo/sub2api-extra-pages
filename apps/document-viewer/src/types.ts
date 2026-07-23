export interface NavigationItem {
  file: string
  title: string
}

export interface NavigationPayload {
  title?: string
  documents: NavigationItem[]
}

export interface DocumentPayload {
  file: string
  title: string
  content: string
  assetBase: string
  updatedAt: string
}

export type UiLocale = 'en-US' | 'zh-CN' | 'zh-TW' | 'ru-RU'
