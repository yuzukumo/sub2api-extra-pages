import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Line } from '@ant-design/plots'
import { Card, Empty, Segmented, Skeleton, Space, theme, Typography } from 'antd'
import { z } from 'zod'
import { messages } from '../i18n'
import { formatMultiplier } from '../lib/catalog'
import type { CatalogGroup, Locale } from '../types/catalog'

const rateHistoryRanges = ['24h', '7d', '30d', 'all'] as const

type RateHistoryRange = (typeof rateHistoryRanges)[number]

const rateHistoryResponseSchema = z.object({
  points: z.array(z.object({
    recordedAt: z.iso.datetime(),
    multiplier: z.number().nonnegative(),
  })),
})

interface RateHistoryChartProps {
  groups: CatalogGroup[]
  locale: Locale
  selectedGroup?: CatalogGroup
}

async function loadRateHistory(groupId: string, range: RateHistoryRange) {
  const query = new URLSearchParams({ groupId, range })
  const response = await fetch(`${import.meta.env.BASE_URL}api/rate-history?${query}`, {
    cache: 'no-cache',
  })
  if (!response.ok) throw new Error(`Rate history request failed (${response.status})`)
  return rateHistoryResponseSchema.parse(await response.json())
}

function formatTimestamp(value: string | number, locale: Locale, range: RateHistoryRange, detailed = false): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  const options: Intl.DateTimeFormatOptions = detailed || range === '24h'
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : range === 'all'
      ? { year: 'numeric', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function RateHistoryChart({ groups, locale, selectedGroup }: RateHistoryChartProps) {
  const { token } = theme.useToken()
  const copy = messages[locale]
  const group = selectedGroup ?? groups[0]
  const [range, setRange] = useState<RateHistoryRange>('24h')
  const historyQuery = useQuery({
    queryKey: ['rate-history', group?.id, range],
    queryFn: () => loadRateHistory(group!.id, range),
    enabled: Boolean(group),
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
  })
  const data = useMemo(() => (historyQuery.data?.points ?? [])
    .map((point) => ({
      ...point,
      label: formatTimestamp(point.recordedAt, locale, range, true),
    }))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt)), [historyQuery.data, locale, range])

  return (
    <Card
      size="small"
      title={<Typography.Text strong>{copy.rateHistory}</Typography.Text>}
      extra={(
        <Space size={token.paddingXS} wrap>
          <Segmented
            size="small"
            value={range}
            onChange={(value) => setRange(value as RateHistoryRange)}
            options={[
              { label: copy.rateHistory24Hours, value: '24h' },
              { label: copy.rateHistory7Days, value: '7d' },
              { label: copy.rateHistory30Days, value: '30d' },
              { label: copy.rateHistoryAll, value: 'all' },
            ]}
          />
          {group && <Typography.Text type="secondary">{group.name} {formatMultiplier(group.rateMultiplier)}</Typography.Text>}
        </Space>
      )}
    >
      {historyQuery.isLoading ? (
        <Skeleton active title={false} paragraph={{ rows: 6 }} />
      ) : historyQuery.isError ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.rateHistoryLoadError} />
      ) : data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.noRateHistory} />
      ) : (
        <Line
          data={data}
          xField="recordedAt"
          yField="multiplier"
          height={220}
          autoFit
          scale={{
            x: { type: 'time' },
            y: { nice: true },
          }}
          axis={{
            x: {
              labelAutoRotate: false,
              labelFormatter: (value: string | number) => formatTimestamp(value, locale, range),
            },
            y: {
              title: copy.multiplier,
              labelFormatter: (value: string | number) => formatMultiplier(Number(value)),
            },
          }}
          tooltip={{
            title: 'label',
            items: [{ channel: 'y', name: copy.multiplier, valueFormatter: (value: string | number) => formatMultiplier(Number(value)) }],
          }}
          style={{ lineWidth: 2, stroke: token.colorPrimary }}
        />
      )}
    </Card>
  )
}
