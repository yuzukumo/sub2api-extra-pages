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
import type { CatalogModel, Locale, ModelCatalog } from '../types/catalog'
import { ModelIcon } from './ModelIcon'

const { Paragraph, Text, Title } = Typography

interface ModelCardProps {
  catalog: ModelCatalog
  locale: Locale
  model: CatalogModel
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
  const prices = [
    { label: copy.inputPrice, value: formatPrice(model.pricing.input, catalog) },
    { label: copy.outputPrice, value: formatPrice(model.pricing.output, catalog) },
    { label: copy.cacheRead, value: formatPrice(model.pricing.cacheRead, catalog) },
    { label: copy.cacheWrite, value: formatPrice(model.pricing.cacheWrite, catalog) },
  ]

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

        <Divider
          plain
          size="small"
          titlePlacement="start"
          style={{ marginTop: 'auto', marginBottom: 0 }}
        >
          <Space size={token.paddingXS}>
            <Text strong>{copy.pricing}</Text>
            <Text type="secondary">{formatPriceUnit()}</Text>
          </Space>
        </Divider>
        <Row gutter={[token.paddingSM, token.paddingSM]}>
          {prices.map((price) => (
            <Col span={12} key={price.label}>
              <Statistic
                title={price.label}
                value={price.value}
                styles={{
                  title: { color: token.colorTextSecondary },
                  content: { lineHeight: token.lineHeightLG },
                }}
              />
            </Col>
          ))}
        </Row>
      </Flex>
    </Card>
  )
}
