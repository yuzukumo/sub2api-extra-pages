import { useEffect, useMemo, useState } from 'react'
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
import { LanguageSelect } from './components/LanguageSelect'
import { MarkdownDocument } from './components/MarkdownDocument'
import { ThemeSelect } from './components/ThemeSelect'
import { useDocumentSelection } from './hooks/useDocumentSelection'
import { useLocalePreference } from './hooks/useLocalePreference'
import { useThemePreference } from './hooks/useThemePreference'
import { messages } from './i18n'
import {
  extractHeadings,
  getDocumentTitle,
} from './lib/document'
import { documentSchema, navigationSchema } from './schemas'
import type { DocumentHeading } from './lib/document'
import type { DocumentPayload, NavigationPayload, UiLocale } from './types'

const { Text } = Typography

async function loadNavigation(locale: UiLocale): Promise<NavigationPayload> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}api/navigation?locale=${encodeURIComponent(locale)}`,
    { cache: 'no-cache' },
  )
  if (!response.ok) throw new Error(`Navigation request failed (${response.status})`)
  return navigationSchema.parse(await response.json())
}

async function loadDocument(file: string, locale: UiLocale): Promise<DocumentPayload> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}api/document?file=${encodeURIComponent(file)}&locale=${encodeURIComponent(locale)}`,
    { cache: 'no-cache' },
  )
  if (!response.ok) throw new Error(`Document request failed (${response.status})`)
  return documentSchema.parse(await response.json())
}

interface NavigationMenuProps {
  headings: DocumentHeading[]
  navigation: NavigationPayload
  selectedFile?: string
  onSelect: (file: string) => void
  onNavigate: () => void
}

function NavigationMenu({
  headings,
  navigation,
  selectedFile,
  onSelect,
  onNavigate,
}: NavigationMenuProps) {
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const headingItems = headings
    .filter((heading) => heading.level > 1)
    .map((heading) => ({
      key: `heading:${selectedFile}:${heading.id}`,
      label: <a href={`#${heading.id}`}>{heading.title}</a>,
    }))

  useEffect(() => {
    setOpenKeys(selectedFile && headingItems.length > 0 ? [selectedFile] : [])
  }, [headingItems.length, selectedFile])

  return (
    <Menu
      mode="inline"
      openKeys={openKeys}
      onOpenChange={setOpenKeys}
      selectedKeys={selectedFile ? [selectedFile] : []}
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
          children: headingItems,
        }
      })}
      style={{ borderInlineEnd: 0, background: 'transparent' }}
    />
  )
}

interface ReaderPageProps {
  dark: boolean
  locale: UiLocale
  onLocaleChange: (locale: UiLocale) => void
  themePreference: ReturnType<typeof useThemePreference>[0]
  onThemeChange: ReturnType<typeof useThemePreference>[1]
}

function ReaderPage({
  dark,
  locale,
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
    queryKey: ['navigation', locale],
    queryFn: () => loadNavigation(locale),
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

  useEffect(() => {
    if (effectiveFile && effectiveFile !== selectedFile) replaceDocument(effectiveFile)
  }, [effectiveFile, replaceDocument, selectedFile])

  useEffect(() => {
    const documentTitle = getDocumentTitle(headings) ?? currentDocument?.title
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
        <LanguageSelect locale={locale} onChange={onLocaleChange} />
      </Space>
    </Flex>
  )

  if (navigationQuery.isError) {
    return (
      <Flex vertical gap={token.paddingMD} style={{ minHeight: '100vh', padding: token.paddingMD }}>
        {toolbar}
        <Result
          status="error"
          title={copy.documentUnavailable}
          subTitle={copy.documentUnavailableHint}
          extra={<Button onClick={() => navigationQuery.refetch()}>{copy.retry}</Button>}
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
        background: token.colorBgContainer,
      }}
    >
      <div style={{ width: '100%', maxWidth: 1280, marginInline: 'auto' }}>
        {toolbar}
      </div>

      {navigationQuery.isLoading ? (
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
          style={{ width: '100%', maxWidth: 1280, marginInline: 'auto' }}
        >
          {screens.lg && (
            <aside
              style={{
                width: 208,
                flex: '0 0 208px',
                maxHeight: 'calc(100vh - 96px)',
                overflowY: 'auto',
                position: 'sticky',
                top: token.paddingMD,
              }}
            >
              <Space direction="vertical" size={token.paddingXS} style={{ width: '100%' }}>
                <Text strong>{navigation.title ?? copy.documents}</Text>
                <NavigationMenu
                  headings={headings}
                  navigation={navigation}
                  selectedFile={effectiveFile}
                  onSelect={handleSelect}
                  onNavigate={() => setNavigationOpen(false)}
                />
              </Space>
            </aside>
          )}

          <main style={{ width: '100%', maxWidth: 760, minWidth: 0, paddingBottom: 64 }}>
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
  const [locale, setLocale] = useLocalePreference()
  const [themePreference, setThemePreference, dark] = useThemePreference()

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
          colorPrimary: '#0f8f84',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          wireframe: false,
        },
        components: {
          Menu: {
            itemBorderRadius: 8,
            subMenuItemBorderRadius: 8,
            subMenuItemBg: 'transparent',
          },
        },
      }}
    >
      <AntApp>
        <ReaderPage
          dark={dark}
          locale={locale}
          onLocaleChange={setLocale}
          themePreference={themePreference}
          onThemeChange={setThemePreference}
        />
      </AntApp>
    </ConfigProvider>
  )
}
