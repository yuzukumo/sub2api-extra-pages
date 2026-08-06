import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileTextOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import enUS from 'antd/locale/en_US'
import ruRU from 'antd/locale/ru_RU'
import zhCN from 'antd/locale/zh_CN'
import zhTW from 'antd/locale/zh_TW'
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Drawer,
  Empty,
  Flex,
  Grid,
  Menu,
  Result,
  Skeleton,
  Space,
  theme,
  Tooltip,
  Typography,
} from 'antd'
import type { MenuProps } from 'antd'
import { LanguageSelect } from './components/LanguageSelect'
import { MarkdownDocument } from './components/MarkdownDocument'
import { ThemeSelect } from './components/ThemeSelect'
import { useDocumentSelection } from './hooks/useDocumentSelection'
import { useLocalePreference } from './hooks/useLocalePreference'
import { useThemePreference } from './hooks/useThemePreference'
import { getAvailableLocales, messages } from './i18n'
import {
  buildAnchorItems,
  extractHeadings,
  getDocumentAssetBase,
  getDocumentTitle,
  resolveDocumentUrl,
} from './lib/document'
import { documentManifestSchema } from './schemas'
import type { DocumentHeading } from './lib/document'
import type { DocumentManifest, DocumentPayload, NavigationPayload, UiLocale } from './types'

const { Text } = Typography

async function loadManifest(): Promise<DocumentManifest> {
  const response = await fetch(resolveDocumentUrl('documents.json'), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Document manifest request failed (${response.status})`)
  return documentManifestSchema.parse(await response.json())
}

async function loadDocument(file: string, locale: UiLocale): Promise<DocumentPayload> {
  const response = await fetch(resolveDocumentUrl(file, locale), { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Document request failed (${response.status})`)

  return {
    file,
    content: await response.text(),
    assetBase: getDocumentAssetBase(locale, file),
  }
}

async function loadNavigation(
  manifest: DocumentManifest,
  locale: UiLocale,
): Promise<NavigationPayload> {
  const documents = await Promise.all(manifest.documents.map(async ({ file }) => {
    const document = await loadDocument(file, locale)
    const title = getDocumentTitle(extractHeadings(document.content))
    if (!title) throw new Error(`Document must contain a level-one heading: ${file}`)
    return { file, title }
  }))

  return {
    title: manifest.title?.[locale],
    documents,
  }
}

interface NavigationMenuProps {
  activeHeadingId?: string
  headings: DocumentHeading[]
  navigation: NavigationPayload
  selectedFile?: string
  onSelect: (file: string) => void
  onNavigate: () => void
}

function NavigationMenu({
  activeHeadingId,
  headings,
  navigation,
  selectedFile,
  onSelect,
  onNavigate,
}: NavigationMenuProps) {
  const navigationRef = useRef<HTMLDivElement>(null)
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const headingItems = buildAnchorItems(headings.filter((heading) => heading.level > 1))
  const menuItems = (items: typeof headingItems): NonNullable<MenuProps['items']> => items.map((item) => ({
    key: `heading:${selectedFile}:${item.key}`,
    label: <a href={item.href}>{item.title}</a>,
    children: item.children ? menuItems(item.children) : undefined,
  }))
  const expandedHeadingKeys = (items: typeof headingItems): string[] => items.flatMap((item) => (
    item.children?.length
      ? [`heading:${selectedFile}:${item.key}`, ...expandedHeadingKeys(item.children)]
      : []
  ))
  const getHeadingParentKeys = (
    items: typeof headingItems,
    headingId: string,
    parentKeys: string[] = [],
  ): string[] | undefined => {
    for (const item of items) {
      const key = `heading:${selectedFile}:${item.key}`
      if (item.key === headingId) return parentKeys
      if (item.children) {
        const nestedParents = getHeadingParentKeys(item.children, headingId, [...parentKeys, key])
        if (nestedParents) return nestedParents
      }
    }
    return undefined
  }

  useEffect(() => {
    setOpenKeys(selectedFile && headingItems.length > 0
      ? [selectedFile, ...expandedHeadingKeys(headingItems)]
      : [])
  }, [headingItems.length, selectedFile])

  useEffect(() => {
    if (!activeHeadingId || !selectedFile) return

    const parentKeys = getHeadingParentKeys(headingItems, activeHeadingId) ?? []
    setOpenKeys((current) => Array.from(new Set([...current, selectedFile, ...parentKeys])))

    const frame = window.requestAnimationFrame(() => {
      const links = navigationRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]')
      const activeLink = Array.from(links ?? []).find((link) => link.getAttribute('href') === `#${activeHeadingId}`)
      activeLink?.scrollIntoView({ block: 'nearest' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeHeadingId, selectedFile])

  return (
    <div ref={navigationRef}>
      <Menu
        mode="inline"
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        selectedKeys={activeHeadingId && selectedFile
          ? [`heading:${selectedFile}:${activeHeadingId}`]
          : selectedFile ? [selectedFile] : []}
        onClick={({ key }) => {
          if (key.startsWith('heading:')) {
            onNavigate()
            return
          }
          onSelect(key)
        }}
        items={navigation.documents.map((document) => {
          const baseItem = {
            key: document.file,
            icon: <FileTextOutlined />,
            label: document.title,
          }
          if (document.file !== selectedFile || headingItems.length === 0) return baseItem
          return {
            ...baseItem,
            children: menuItems(headingItems),
          }
        })}
        style={{ borderInlineEnd: 0, background: 'transparent' }}
      />
    </div>
  )
}

function useActiveHeading(headings: DocumentHeading[]): string | undefined {
  const [activeHeadingId, setActiveHeadingId] = useState<string>()

  useEffect(() => {
    const elements = headings
      .filter((heading) => heading.level > 1)
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null)

    if (elements.length === 0) {
      setActiveHeadingId(undefined)
      return
    }

    let frame: number | undefined
    const updateActiveHeading = () => {
      frame = undefined
      const offset = window.innerHeight * 0.25
      const active = elements.reduce((current, element) => (
        element.getBoundingClientRect().top <= offset ? element.id : current
      ), elements[0]!.id)
      setActiveHeadingId(active)
    }
    const scheduleUpdate = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateActiveHeading)
    }

    scheduleUpdate()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [headings])

  return activeHeadingId
}

interface ReaderPageProps {
  availableLocales?: UiLocale[]
  dark: boolean
  locale: UiLocale
  manifest?: DocumentManifest
  manifestError: boolean
  manifestLoading: boolean
  onManifestRetry: () => void
  onLocaleChange: (locale: UiLocale) => void
  themePreference: ReturnType<typeof useThemePreference>[0]
  onThemeChange: ReturnType<typeof useThemePreference>[1]
}

function ReaderPage({
  availableLocales,
  dark,
  locale,
  manifest,
  manifestError,
  manifestLoading,
  onManifestRetry,
  onLocaleChange,
  themePreference,
  onThemeChange,
}: ReaderPageProps) {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const copy = messages[locale]
  const [navigationOpen, setNavigationOpen] = useState(false)
  const { selectedFile, selectDocument, replaceDocument } = useDocumentSelection()
  const navigationQuery = useQuery({
    queryKey: ['navigation', manifest, locale],
    queryFn: () => loadNavigation(manifest!, locale),
    enabled: Boolean(manifest),
  })
  const navigation = navigationQuery.data
  const selectedExists = navigation?.documents.some((document) => document.file === selectedFile)
  const effectiveFile = selectedExists ? selectedFile : navigation?.documents[0]?.file
  const documentQuery = useQuery({
    queryKey: ['document', effectiveFile, locale],
    queryFn: () => loadDocument(effectiveFile!, locale),
    enabled: Boolean(effectiveFile),
  })
  const currentDocument = documentQuery.data
  const headings = useMemo(
    () => currentDocument ? extractHeadings(currentDocument.content) : [],
    [currentDocument],
  )
  const activeHeadingId = useActiveHeading(headings)

  useEffect(() => {
    if (effectiveFile && effectiveFile !== selectedFile) replaceDocument(effectiveFile)
  }, [effectiveFile, replaceDocument, selectedFile])

  useEffect(() => {
    const documentTitle = getDocumentTitle(headings)
    document.title = [documentTitle, navigation?.title].filter(Boolean).join(' - ') || 'Documentation'
  }, [currentDocument, headings, navigation])

  const handleSelect = (file: string) => {
    selectDocument(file)
    setNavigationOpen(false)
  }

  const toolbar = (
    <Flex align="center" justify="flex-end" gap={token.paddingXS}>
      {!screens.lg && navigation && (
        <Tooltip title={copy.documents}>
          <Button
            aria-label={copy.documents}
            icon={<MenuOutlined />}
            type="text"
            onClick={() => setNavigationOpen(true)}
          />
        </Tooltip>
      )}
      <Space align="center" size={12} wrap>
        <ThemeSelect locale={locale} value={themePreference} onChange={onThemeChange} />
        {availableLocales && (
          <LanguageSelect
            availableLocales={availableLocales}
            locale={locale}
            onChange={onLocaleChange}
          />
        )}
      </Space>
    </Flex>
  )

  if (manifestError || navigationQuery.isError) {
    return (
      <Flex vertical gap={token.paddingMD} style={{ minHeight: '100vh', padding: token.paddingMD }}>
        {toolbar}
        <Result
          status="error"
          title={copy.documentUnavailable}
          subTitle={copy.documentUnavailableHint}
          extra={(
            <Button onClick={() => (manifestError ? onManifestRetry() : navigationQuery.refetch())}>
              {copy.retry}
            </Button>
          )}
        />
      </Flex>
    )
  }

  return (
    <Flex
      vertical
      gap={token.paddingMD}
      style={{
        minHeight: '100vh',
        padding: screens.sm ? token.paddingLG : token.paddingMD,
        background: token.colorBgLayout,
      }}
    >
      <div style={{ width: '100%', maxWidth: 1600, marginInline: 'auto' }}>
        {toolbar}
      </div>

      {manifestLoading || navigationQuery.isLoading ? (
        <div style={{ width: '100%', maxWidth: 760, marginInline: 'auto' }}>
          <Skeleton active title paragraph={{ rows: 14 }} />
        </div>
      ) : !navigation || navigation.documents.length === 0 ? (
        <Empty description={copy.emptyDocument} />
      ) : (
        <Flex
          align="flex-start"
          justify="center"
          gap={screens.xl ? token.paddingXL : token.paddingLG}
          style={{ width: '100%', maxWidth: 1600, marginInline: 'auto' }}
        >
          {screens.lg && (
            <aside
              style={{
                width: 240,
                flex: '0 0 240px',
                maxHeight: 'calc(100vh - 96px)',
                overflowY: 'auto',
                position: 'sticky',
                top: token.paddingMD,
              }}
            >
              <Space direction="vertical" size={token.paddingXS} style={{ width: '100%' }}>
                <Text strong>{navigation.title ?? copy.documents}</Text>
                <NavigationMenu
                  activeHeadingId={activeHeadingId}
                  headings={headings}
                  navigation={navigation}
                  selectedFile={effectiveFile}
                  onSelect={handleSelect}
                  onNavigate={() => setNavigationOpen(false)}
                />
              </Space>
            </aside>
          )}

          <main style={{ flex: '1 1 0', minWidth: 0, paddingBottom: 64 }}>
            {documentQuery.isError ? (
              <Result
                status="error"
                title={copy.documentUnavailable}
                subTitle={copy.documentUnavailableHint}
                extra={<Button onClick={() => documentQuery.refetch()}>{copy.retry}</Button>}
              />
            ) : documentQuery.isLoading || !currentDocument ? (
              <Skeleton active title paragraph={{ rows: 14 }} />
            ) : currentDocument.content.trim() ? (
              <MarkdownDocument
                assetBase={currentDocument.assetBase}
                content={currentDocument.content}
                dark={dark}
                diagramError={copy.diagramError}
              />
            ) : (
              <Empty description={copy.emptyDocument} />
            )}
          </main>

        </Flex>
      )}

      {navigation && (
        <Drawer
          open={navigationOpen}
          placement="left"
          title={navigation.title ?? copy.documents}
          width={300}
          onClose={() => setNavigationOpen(false)}
        >
          <NavigationMenu
            activeHeadingId={activeHeadingId}
            headings={headings}
            navigation={navigation}
            selectedFile={effectiveFile}
            onSelect={handleSelect}
            onNavigate={() => setNavigationOpen(false)}
          />
        </Drawer>
      )}
    </Flex>
  )
}

export default function App() {
  const manifestQuery = useQuery({ queryKey: ['manifest'], queryFn: loadManifest })
  const availableLocales = manifestQuery.data
    ? getAvailableLocales(manifestQuery.data.title)
    : undefined
  const [locale, setLocale] = useLocalePreference(availableLocales)
  const [themePreference, setThemePreference, dark] = useThemePreference()

  const palette = dark
    ? {
        colorBgBase: '#020617',
        colorBgLayout: '#020617',
        colorBgContainer: '#0f172a',
        colorBgElevated: '#1e293b',
        colorBorder: '#334155',
        colorBorderSecondary: '#1e293b',
        colorFillAlter: '#1e293b',
        colorFillTertiary: '#1e293b',
        colorText: '#f8fafc',
        colorTextSecondary: '#94a3b8',
        colorTextTertiary: '#64748b',
        boxShadowTertiary: '0 1px 3px rgba(0, 0, 0, 0.3)',
      }
    : {
        colorBgBase: '#ffffff',
        colorBgLayout: '#f8fafc',
        colorBgContainer: '#ffffff',
        colorBgElevated: '#ffffff',
        colorBorder: '#e2e8f0',
        colorBorderSecondary: '#f1f5f9',
        colorFillAlter: '#f8fafc',
        colorFillTertiary: '#f1f5f9',
        colorText: '#0f172a',
        colorTextSecondary: '#64748b',
        colorTextTertiary: '#94a3b8',
        boxShadowTertiary: '0 1px 3px rgba(15, 23, 42, 0.08)',
      }

  return (
    <ConfigProvider
      locale={
        locale === 'zh-CN' ? zhCN
          : locale === 'zh-TW' ? zhTW
            : locale === 'ru-RU' ? ruRU
              : enUS
      }
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          ...palette,
          colorPrimary: '#0d9488',
          colorInfo: '#0d9488',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          wireframe: false,
        },
        components: {
          Menu: {
            itemBorderRadius: 8,
            itemHoverBg: dark ? '#1e293b' : '#f1f5f9',
            itemSelectedBg: dark ? '#042f2e' : '#f0fdfa',
            itemSelectedColor: dark ? '#5eead4' : '#0f766e',
            itemMarginBlock: 2,
            itemMarginInline: 0,
            subMenuItemBorderRadius: 8,
            subMenuItemBg: 'transparent',
          },
        },
      }}
    >
      <AntApp>
        <ReaderPage
          availableLocales={availableLocales}
          dark={dark}
          locale={locale}
          manifest={manifestQuery.data}
          manifestError={manifestQuery.isError}
          manifestLoading={manifestQuery.isLoading}
          onManifestRetry={() => manifestQuery.refetch()}
          onLocaleChange={setLocale}
          themePreference={themePreference}
          onThemeChange={setThemePreference}
        />
      </AntApp>
    </ConfigProvider>
  )
}
