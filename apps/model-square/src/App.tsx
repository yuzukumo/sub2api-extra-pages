import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClockCircleOutlined,
  ClusterOutlined,
  DesktopOutlined,
  FilterOutlined,
  GlobalOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
} from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'
import zhTW from 'antd/locale/zh_TW'
import enUS from 'antd/locale/en_US'
import ruRU from 'antd/locale/ru_RU'
import {
  App as AntApp,
  Alert,
  Button,
  ConfigProvider,
  Empty,
  Flex,
  Grid,
  Input,
  Result,
  Select,
  Skeleton,
  Space,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd'
import { ModelCard } from './components/ModelCard'
import { ResponsiveCardGrid } from './components/ResponsiveCardGrid'
import { useLocalePreference } from './hooks/useLocalePreference'
import { useThemePreference } from './hooks/useThemePreference'
import type { ThemePreference } from './hooks/useThemePreference'
import { formatUpdatedDate, localeOptions, messages } from './i18n'
import {
  filterModels,
  formatMultiplier,
  getProviders,
} from './lib/catalog'
import { catalogSchema } from './schemas/catalog'
import type { Locale, ModelCatalog } from './types/catalog'

const { Text, Title } = Typography
const RateHistoryChart = lazy(async () => {
  const module = await import('./components/RateHistoryChart')
  return { default: module.RateHistoryChart }
})

async function loadCatalog(): Promise<ModelCatalog> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/catalog`, {
    cache: 'no-cache',
  })
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`)
  return catalogSchema.parse(await response.json())
}

interface LanguageSelectProps {
  locale: Locale
  onChange: (locale: Locale) => void
}

interface PagePreferencesProps extends LanguageSelectProps {
  themePreference: ThemePreference
  onThemeChange: (preference: ThemePreference) => void
}

function LanguageSelect({ locale, onChange }: LanguageSelectProps) {
  const copy = messages[locale]

  return (
    <Space align="center" size={6}>
      <Tooltip title={copy.language}>
        <GlobalOutlined aria-label={copy.language} />
      </Tooltip>
      <Select
        aria-label={copy.language}
        variant="outlined"
        value={locale}
        onChange={onChange}
        options={localeOptions}
        style={{ width: 148 }}
      />
    </Space>
  )
}

function PagePreferences({
  locale,
  onChange,
  themePreference,
  onThemeChange,
}: PagePreferencesProps) {
  const copy = messages[locale]

  return (
    <Space align="center" size={12} wrap>
      <Select<ThemePreference>
        aria-label={copy.appearance}
        variant="outlined"
        value={themePreference}
        onChange={onThemeChange}
        options={[
          {
            value: 'system',
            label: <Space size={6}><DesktopOutlined />{copy.themeSystem}</Space>,
          },
          {
            value: 'light',
            label: <Space size={6}><SunOutlined />{copy.themeLight}</Space>,
          },
          {
            value: 'dark',
            label: <Space size={6}><MoonOutlined />{copy.themeDark}</Space>,
          },
        ]}
        style={{ width: 144 }}
      />
      <LanguageSelect locale={locale} onChange={onChange} />
    </Space>
  )
}

function CatalogPage({
  locale,
  onChange,
  themePreference,
  onThemeChange,
}: PagePreferencesProps) {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const copy = messages[locale]
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState<string>()
  const [groupId, setGroupId] = useState<string>()
  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: loadCatalog,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: true,
  })

  const catalog = catalogQuery.data
  const providers = useMemo(() => getProviders(catalog?.models ?? []), [catalog])
  const groups = catalog?.groups ?? []
  const selectedGroup = groups.find((group) => group.id === groupId) ?? groups[0]
  const models = useMemo(() => {
    if (!catalog) return []
    return filterModels(catalog.models, { query, provider })
      .filter((model) => !selectedGroup || model.groupPricing?.some((item) => item.groupId === selectedGroup.id))
  }, [catalog, query, provider, selectedGroup])

  if (catalogQuery.isError) {
    return (
      <Flex vertical gap={token.paddingMD} style={{ minHeight: '100vh', padding: token.paddingMD }}>
        <Flex justify="flex-end">
          <PagePreferences
            locale={locale}
            onChange={onChange}
            themePreference={themePreference}
            onThemeChange={onThemeChange}
          />
        </Flex>
        <Result
          status="error"
          title={copy.loadError}
          subTitle={copy.loadErrorHint}
          extra={<Button onClick={() => catalogQuery.refetch()}>{copy.retry}</Button>}
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
        padding: token.paddingMD,
        background: token.colorBgLayout,
      }}
    >
      <Flex align="center" justify="space-between" gap={token.paddingMD} wrap>
        <Flex align="baseline" gap={token.paddingSM} wrap>
          <Title level={4} style={{ margin: 0 }}>{copy.title}</Title>
          <Tag color="cyan" variant="filled">
            {catalog ? copy.modelCount(models.length) : copy.loading}
          </Tag>
          {catalog && (
            <Space size={4}>
              <ClockCircleOutlined style={{ color: token.colorTextTertiary }} />
              <Text type="secondary">
                {copy.updatedAt(formatUpdatedDate(catalog.updatedAt, locale))}
              </Text>
            </Space>
          )}
        </Flex>
        <PagePreferences
          locale={locale}
          onChange={onChange}
          themePreference={themePreference}
          onThemeChange={onThemeChange}
        />
      </Flex>

      {catalog?.notice && <Alert message={catalog.notice} type="info" showIcon />}

      <Flex gap={token.paddingSM} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          variant="outlined"
          placeholder={copy.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: screens.sm ? 320 : '100%' }}
        />
        <Select
          allowClear
          aria-label={copy.allProviders}
          prefix={<FilterOutlined />}
          variant="outlined"
          placeholder={copy.allProviders}
          value={provider}
          onChange={setProvider}
          options={providers.map((value) => ({
            label: value === 'unknown' ? copy.unknownProvider : value,
            value,
          }))}
          style={{ minWidth: 150, flex: screens.sm ? undefined : 1 }}
        />
        {groups.length > 0 && (
          <Select
            aria-label={copy.groups}
            prefix={<ClusterOutlined />}
            variant="outlined"
            value={selectedGroup?.id}
            onChange={setGroupId}
            options={groups.map((group) => ({
              label: `${group.name} ${formatMultiplier(group.rateMultiplier)}`,
              value: group.id,
            }))}
            style={{ minWidth: 210, flex: screens.sm ? undefined : 1 }}
          />
        )}
      </Flex>

      {groups.length > 0 && (
        <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
          <RateHistoryChart
            groups={groups}
            locale={locale}
            selectedGroup={selectedGroup}
          />
        </Suspense>
      )}

      {catalogQuery.isLoading ? (
        <ResponsiveCardGrid gap={token.paddingSM}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <Skeleton key={item} active paragraph={{ rows: 8 }} style={{ width: '100%' }} />
          ))}
        </ResponsiveCardGrid>
      ) : models.length === 0 ? (
        <Empty description={copy.empty} />
      ) : (
        <ResponsiveCardGrid gap={token.paddingSM}>
          {models.map((model) => (
            <ModelCard
              key={model.id}
              catalog={catalog!}
              locale={locale}
              model={model}
              selectedGroup={selectedGroup}
            />
          ))}
        </ResponsiveCardGrid>
      )}
    </Flex>
  )
}

export default function App() {
  const [locale, setLocale] = useLocalePreference()
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

  useEffect(() => {
    document.title = messages[locale].title
  }, [locale])

  return (
    <ConfigProvider
      locale={
        locale === 'en-US' ? enUS
          : locale === 'zh-TW' ? zhTW
            : locale === 'ru-RU' ? ruRU
              : zhCN
      }
      theme={{
        algorithm: dark
          ? [theme.darkAlgorithm, theme.compactAlgorithm]
          : theme.compactAlgorithm,
        token: {
          ...palette,
          colorPrimary: '#0d9488',
          colorInfo: '#0d9488',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          controlHeight: 32,
          controlHeightSM: 28,
          wireframe: false,
        },
        components: {
          Card: {
            headerBg: 'transparent',
            bodyPaddingSM: 14,
          },
          Descriptions: {
            itemPaddingBottom: 6,
            itemPaddingEnd: 12,
          },
          Statistic: {
            titleFontSize: 12,
            contentFontSize: 17,
          },
        },
      }}
    >
      <AntApp>
        <CatalogPage
          locale={locale}
          onChange={setLocale}
          themePreference={themePreference}
          onThemeChange={setThemePreference}
        />
      </AntApp>
    </ConfigProvider>
  )
}
