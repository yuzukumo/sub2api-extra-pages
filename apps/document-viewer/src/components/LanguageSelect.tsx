import { GlobalOutlined } from '@ant-design/icons'
import { Select, Space, Tooltip } from 'antd'
import { localeOptions, messages } from '../i18n'
import type { UiLocale } from '../types'

interface LanguageSelectProps {
  locale: UiLocale
  onChange: (locale: UiLocale) => void
}

export function LanguageSelect({ locale, onChange }: LanguageSelectProps) {
  const copy = messages[locale]

  return (
    <Space align="center" size={6}>
      <Tooltip title={copy.language}>
        <GlobalOutlined aria-label={copy.language} />
      </Tooltip>
      <Select
        aria-label={copy.language}
        variant="filled"
        value={locale}
        onChange={onChange}
        options={localeOptions}
        style={{ width: 148 }}
      />
    </Space>
  )
}
