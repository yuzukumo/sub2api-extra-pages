import { uiLocales, type UiLocale } from './types'

interface Copy {
  appearance: string
  diagramError: string
  documents: string
  documentUnavailable: string
  documentUnavailableHint: string
  emptyDocument: string
  retry: string
  language: string
  themeDark: string
  themeLight: string
  themeSystem: string
}

export const localeOptions: Array<{ label: string; value: UiLocale }> = [
  { label: 'English', value: 'en-US' },
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁體中文（台灣）', value: 'zh-TW' },
  { label: 'Русский', value: 'ru-RU' },
]

export function getAvailableLocales(title?: Partial<Record<UiLocale, string>>): UiLocale[] {
  const configuredLocales = uiLocales.filter((locale) => title?.[locale])
  return configuredLocales.length > 0 ? configuredLocales : ['en-US']
}

export function getLocaleOptions(locales: readonly UiLocale[]) {
  return localeOptions.filter((option) => locales.includes(option.value))
}

export function resolveAvailableLocale(
  preferredLocale: UiLocale,
  availableLocales: readonly UiLocale[],
): UiLocale {
  if (availableLocales.includes(preferredLocale)) return preferredLocale
  if (availableLocales.includes('en-US')) return 'en-US'
  return availableLocales[0] ?? 'en-US'
}

export const messages: Record<UiLocale, Copy> = {
  'en-US': {
    appearance: 'Appearance',
    diagramError: 'The diagram could not be rendered.',
    documents: 'Documents',
    documentUnavailable: 'Unable to load document',
    documentUnavailableHint: 'Make sure the Markdown file exists and can be read.',
    emptyDocument: 'This document is empty.',
    retry: 'Retry',
    language: 'Language',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeSystem: 'System',
  },
  'zh-CN': {
    appearance: '外观',
    diagramError: '图表无法渲染。',
    documents: '文档',
    documentUnavailable: '暂时无法显示文档',
    documentUnavailableHint: '请确认 Markdown 文件存在且可读取。',
    emptyDocument: '此文档暂无内容。',
    retry: '重试',
    language: '语言',
    themeDark: '深色',
    themeLight: '浅色',
    themeSystem: '跟随系统',
  },
  'zh-TW': {
    appearance: '外觀',
    diagramError: '圖表無法顯示。',
    documents: '說明文件',
    documentUnavailable: '暫時無法顯示文件',
    documentUnavailableHint: '請確認 Markdown 檔案存在且可讀取。',
    emptyDocument: '此文件目前沒有內容。',
    retry: '重試',
    language: '語言',
    themeDark: '深色',
    themeLight: '淺色',
    themeSystem: '跟隨系統',
  },
  'ru-RU': {
    appearance: 'Оформление',
    diagramError: 'Не удалось отобразить диаграмму.',
    documents: 'Документация',
    documentUnavailable: 'Не удалось загрузить документ',
    documentUnavailableHint: 'Проверьте, существует ли файл Markdown и доступен ли он для чтения.',
    emptyDocument: 'Этот документ пуст.',
    retry: 'Повторить',
    language: 'Язык',
    themeDark: 'Тёмная',
    themeLight: 'Светлая',
    themeSystem: 'Как в системе',
  },
}

export function detectLocale(languages: readonly string[]): UiLocale {
  for (const language of languages) {
    const normalized = language.toLowerCase().replaceAll('_', '-')
    if (normalized === 'zh-tw' || normalized.startsWith('zh-hant')) return 'zh-TW'
    if (normalized.startsWith('zh')) return 'zh-CN'
    if (normalized.startsWith('en')) return 'en-US'
    if (normalized.startsWith('ru')) return 'ru-RU'
  }
  return 'en-US'
}
