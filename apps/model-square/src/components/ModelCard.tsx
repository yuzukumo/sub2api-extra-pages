import {
  Card,
  Col,
  Descriptions,
  Divider,
  Flex,
  Row,
  Space,
  Statistic,
  Tag,
  theme,
  Typography,
} from 'antd'
import { formatPrice, formatPriceUnit, formatTokenCount } from '../lib/catalog'
import { messages } from '../i18n'
import type {
  CatalogModel,
  Locale,
  ModelCatalog,
  ModelPriceFields,
  ModelPricingTier,
} from '../types/catalog'
import { ModelIcon } from './ModelIcon'

const { Paragraph, Text, Title } = Typography

interface ModelCardProps {
  catalog: ModelCatalog
  locale: Locale
  model: CatalogModel
}

interface PriceGridProps {
  catalog: ModelCatalog
  copy: (typeof messages)[Locale]
  pricing: ModelPriceFields
  tiers: ModelPricingTier[]
}

function hasPrices(pricing: ModelPriceFields): boolean {
  return [
    pricing.input,
    pricing.output,
    pricing.cacheRead,
    pricing.cacheWrite,
  ].some((value) => value !== undefined)
}

function PriceGrid({ catalog, copy, pricing, tiers }: PriceGridProps) {
  const { token } = theme.useToken()
  const prices = [
    { label: copy.inputPrice, value: pricing.input, key: 'input' as const },
    { label: copy.outputPrice, value: pricing.output, key: 'output' as const },
    { label: copy.cacheRead, value: pricing.cacheRead, key: 'cacheRead' as const },
    { label: copy.cacheWrite, value: pricing.cacheWrite, key: 'cacheWrite' as const },
  ]

  return (
    <Row gutter={[token.paddingSM, token.paddingSM]}>
      {prices.map((price) => {
        const tierPrices = tiers
          .map((tier) => tier.pricing[price.key])
          .filter((value) => value !== undefined)
          .map((value) => formatPrice(value, catalog))

        return (
          <Col span={12} key={price.label}>
            <Statistic
              title={price.label}
              value={formatPrice(price.value, catalog)}
              suffix={
                tierPrices.length > 0 && (
                  <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {tierPrices.join(' ')}
                  </Text>
                )
              }
              styles={{
                title: { color: token.colorTextSecondary },
                content: { lineHeight: token.lineHeightLG },
              }}
            />
          </Col>
        )
      })}
    </Row>
  )
}

export function ModelCard({ catalog, locale, model }: ModelCardProps) {
  const { token } = theme.useToken()
  const copy = messages[locale]
  const details = [
    {
      key: 'model-id',
      label: copy.modelId,
      children: (
        <Text code copyable={{ text: model.id }} style={{ wordBreak: 'break-all' }}>
          {model.id}
        </Text>
      ),
    },
    ...(model.contextWindow
      ? [{ key: 'context', label: copy.context, children: <Text strong>{formatTokenCount(model.contextWindow)}</Text> }]
      : []),
    ...(model.maxOutput
      ? [{ key: 'max-output', label: copy.maxOutput, children: <Text strong>{formatTokenCount(model.maxOutput)}</Text> }]
      : []),
  ]
  const priceTiers = model.pricing.tiers ?? []
  const hasTierPrices = priceTiers.some((tier) => hasPrices(tier.pricing))
  const tierThresholds = priceTiers
    .map((tier) => copy.pricingOverContext(formatTokenCount(tier.contextWindow)))
    .join(' · ')

  return (
    <Card
      hoverable
      size="small"
      variant="outlined"
      style={{ height: '100%', cursor: 'default' }}
      styles={{ body: { height: '100%' } }}
    >
      <Flex vertical gap={token.paddingSM} style={{ height: '100%' }}>
        <Flex align="flex-start" gap={token.paddingSM}>
          <ModelIcon icon={model.icon} size={44} />
          <Flex vertical gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Flex align="center" gap={token.paddingXS} wrap>
              <Title level={5} style={{ margin: 0, overflowWrap: 'anywhere' }}>{model.name}</Title>
            </Flex>
            <Text type="secondary">
              {model.provider === 'unknown' ? copy.unknownProvider : model.provider}
            </Text>
          </Flex>
        </Flex>

        <Paragraph
          type="secondary"
          ellipsis={{ rows: 2 }}
          style={{ margin: 0, minHeight: 44 }}
        >
          {model.description ?? copy.metadataUnavailable}
        </Paragraph>

        <Space size={[4, 6]} wrap>
          {model.capabilities.map((capability) => (
            <Tag color="blue" variant="filled" key={capability}>
              {copy.capabilities[capability] ?? capability}
            </Tag>
          ))}
        </Space>

        <Divider style={{ margin: 0 }} />

        <Descriptions
          size="small"
          column={1}
          colon={false}
          items={details}
          styles={{
            label: { width: '30%', color: token.colorTextSecondary },
            content: { textAlign: 'right', minWidth: 0 },
          }}
        />

        <Flex align="center" gap={token.paddingXS} style={{ marginTop: 'auto', minWidth: 0 }}>
          <Space size={token.paddingXS} style={{ flex: '0 0 auto' }}>
            <Text strong>{copy.pricing}</Text>
            <Text type="secondary">{formatPriceUnit()}</Text>
          </Space>
          {tierThresholds && (
            <Text
              ellipsis={{ tooltip: tierThresholds }}
              type="secondary"
              style={{ flex: 1, fontSize: token.fontSizeSM, minWidth: 0, textAlign: 'right' }}
            >
              {tierThresholds}
            </Text>
          )}
        </Flex>
        <Divider style={{ margin: 0 }} />
        {(hasPrices(model.pricing) || hasTierPrices) && (
          <PriceGrid catalog={catalog} copy={copy} pricing={model.pricing} tiers={priceTiers} />
        )}
      </Flex>
    </Card>
  )
}
