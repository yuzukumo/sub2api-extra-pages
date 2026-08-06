import { Stock } from '@ant-design/plots'
import { Card, Empty, theme, Typography } from 'antd'
import { messages } from '../i18n'
import type { CatalogGroup, CatalogRateHistoryPoint, Locale } from '../types/catalog'

interface RateHistoryChartProps {
  groups: CatalogGroup[]
  history: CatalogRateHistoryPoint[]
  locale: Locale
  selectedGroup?: CatalogGroup
}

export function RateHistoryChart({ groups, history, locale, selectedGroup }: RateHistoryChartProps) {
  const { token } = theme.useToken()
  const copy = messages[locale]
  const group = selectedGroup ?? groups[0]
  const candles = new Map<string, {
    date: string
    open: number
    close: number
    high: number
    low: number
  }>()
  for (const point of [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    const value = point.groups.find((item) => item.groupId === group?.id)
    if (!value) continue
    const candle = candles.get(point.date)
    if (!candle) {
      candles.set(point.date, {
        date: point.date,
        open: value.multiplier,
        close: value.multiplier,
        high: value.multiplier,
        low: value.multiplier,
      })
    } else {
      candle.close = value.multiplier
      candle.high = Math.max(candle.high, value.multiplier)
      candle.low = Math.min(candle.low, value.multiplier)
    }
  }
  const data = [...candles.values()].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Card
      size="small"
      title={<Typography.Text strong>{copy.rateHistory}</Typography.Text>}
      extra={group && <Typography.Text type="secondary">{group.name} ×{group.rateMultiplier}</Typography.Text>}
    >
      {data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.noRateHistory} />
      ) : (
        <Stock
          data={data}
          xField="date"
          yField={['open', 'close', 'high', 'low']}
          height={220}
          autoFit
          scale={{
            y: { nice: true, domainMin: 0 },
            color: {
              domain: [-1, 0, 1],
              range: [token.colorSuccess, token.colorTextTertiary, token.colorError],
            },
          }}
          axis={{
            x: { labelAutoRotate: false },
            y: { title: copy.multiplier },
          }}
          tooltip={{ channel: 'y' }}
        />
      )}
    </Card>
  )
}
