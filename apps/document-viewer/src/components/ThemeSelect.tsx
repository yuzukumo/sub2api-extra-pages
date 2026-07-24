import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Select, Space } from 'antd'
import { messages } from '../i18n'
import type { ThemePreference } from '../hooks/useThemePreference'
import type { UiLocale } from '../types'

interface ThemeSelectProps {
  locale: UiLocale
  value: ThemePreference
  onChange: (preference: ThemePreference) => void
}

export function ThemeSelect({ locale, value, onChange }: ThemeSelectProps) {
  const copy = messages[locale]

  return (
    <Select<ThemePreference>
      aria-label={copy.appearance}
      variant="outlined"
      value={value}
      onChange={onChange}
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
  )
}
