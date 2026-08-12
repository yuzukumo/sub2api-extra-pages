import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { isValidElement, useMemo } from 'react'
import { XMarkdown } from '@ant-design/x-markdown'
import type { ComponentProps, XMarkdownProps } from '@ant-design/x-markdown'
import { Flex, Image, theme, Typography } from 'antd'
import lightHighlightTheme from 'highlight.js/styles/github.css?inline'
import darkHighlightTheme from 'highlight.js/styles/github-dark.css?inline'
import '@ant-design/x-markdown/themes/light.css'
import '@ant-design/x-markdown/themes/dark.css'
import { resolveContentUrl, resolveVideoContentUrl } from '../lib/document'
import { createMarkdownConfig } from '../lib/markdownConfig'
import { MermaidDiagram } from './MermaidDiagram'

const { Text, Link } = Typography
const markdownConfig = createMarkdownConfig()

function reactNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeText).join('')
  if (isValidElement(node)) {
    return reactNodeText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

interface MarkdownDocumentProps {
  assetBase: string
  content: string
  dark: boolean
  diagramError: string
}

export function MarkdownDocument({
  assetBase,
  content,
  dark,
  diagramError,
}: MarkdownDocumentProps) {
  const { token } = theme.useToken()
  const components = useMemo<NonNullable<XMarkdownProps['components']>>(() => {
    const Code = (props: ComponentProps) => {
      const parentName = (props.domNode as { parent?: { name?: string } }).parent?.name
      const isBlock = props.block || parentName === 'pre'
      if (!isBlock) return <Text code>{props.children}</Text>

      const source = reactNodeText(props.children).replace(/\n$/, '')
      const language = props.lang?.toLowerCase()
      if (language === 'mermaid') {
        return <MermaidDiagram dark={dark} errorMessage={diagramError} source={source} />
      }
      if (language === 'video') {
        const src = resolveVideoContentUrl(source, assetBase)
        if (src) {
          return (
            <div
              style={{
                marginBlock: token.marginMD,
                overflow: 'hidden',
                border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                background: '#000',
              }}
            >
              <video
                controls
                playsInline
                preload="metadata"
                src={src}
                style={{ display: 'block', width: '100%', maxHeight: '70vh' }}
              />
            </div>
          )
        }
      }

      return (
        <div
          style={{
            border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            overflow: 'hidden',
          }}
        >
          <Flex
            align="center"
            justify="space-between"
            style={{
              minHeight: 36,
              paddingInline: token.paddingSM,
              background: token.colorFillTertiary,
            }}
          >
            <Text type="secondary" copyable={{ text: source }}>
              {language?.toUpperCase() || 'CODE'}
            </Text>
          </Flex>
          <pre style={{ margin: 0, overflow: 'auto' }}>
            <code className={props.className}>{props.children}</code>
          </pre>
        </div>
      )
    }

    const ImageComponent = (props: ComponentProps) => {
      const imageProps = props as ComponentProps & { alt?: string; src?: string }
      const src = resolveContentUrl(imageProps.src, assetBase)
      if (!src) return null
      return <Image alt={imageProps.alt} src={src} style={{ maxWidth: '100%' }} />
    }

    const LinkComponent = (props: ComponentProps) => {
      const linkProps = props as ComponentProps & { href?: string; title?: string }
      const href = resolveContentUrl(linkProps.href, assetBase)
      const external = /^https?:\/\//i.test(href ?? '')
      return (
        <Link
          href={href}
          title={linkProps.title}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
        >
          {props.children}
        </Link>
      )
    }

    const Pre = (props: ComponentProps) => <>{props.children}</>

    return {
      a: LinkComponent as ComponentType<ComponentProps>,
      code: Code as ComponentType<ComponentProps>,
      img: ImageComponent as ComponentType<ComponentProps>,
      pre: Pre as ComponentType<ComponentProps>,
    }
  }, [assetBase, dark, diagramError, token])

  const rootStyle = {
    '--font-size': '16px',
    lineHeight: 1.75,
  } as CSSProperties

  return (
    <>
      <style>{dark ? darkHighlightTheme : lightHighlightTheme}</style>
      <XMarkdown
        className={dark ? 'x-markdown-dark' : 'x-markdown-light'}
        components={components}
        config={markdownConfig}
        content={content}
        disableDefaultStyles={['pre', 'code']}
        escapeRawHtml
        style={rootStyle}
      />
    </>
  )
}
