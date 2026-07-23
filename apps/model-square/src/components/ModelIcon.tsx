import type { ComponentType } from 'react'
import { RobotOutlined } from '@ant-design/icons'
import {
  Anthropic,
  Claude,
  DeepSeek,
  Gemini,
  Grok,
  Meta,
  Mistral,
  OpenAI,
  Qwen,
} from '@lobehub/icons'
import { Avatar } from 'antd'
import type { IconKey } from '../types/catalog'

interface LobeAvatarProps {
  shape?: 'circle' | 'square'
  size: number
}

const iconRegistry: Partial<Record<IconKey, ComponentType<LobeAvatarProps>>> = {
  openai: OpenAI.Avatar,
  anthropic: Anthropic.Avatar,
  claude: Claude.Avatar,
  gemini: Gemini.Avatar,
  deepseek: DeepSeek.Avatar,
  grok: Grok.Avatar,
  mistral: Mistral.Avatar,
  qwen: Qwen.Avatar,
  meta: Meta.Avatar,
}

export function ModelIcon({ icon, size = 52 }: { icon: IconKey; size?: number }) {
  const Icon = iconRegistry[icon]
  if (Icon) return <Icon shape="square" size={size} />
  return <Avatar shape="square" size={size} icon={<RobotOutlined />} />
}
