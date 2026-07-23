import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { Alert, Skeleton } from 'antd'

let diagramSequence = 0
let renderQueue: Promise<unknown> = Promise.resolve()

async function renderDiagram(source: string, dark: boolean): Promise<string> {
  const task = renderQueue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
    })
    diagramSequence += 1
    const result = await mermaid.render(`sub2api-diagram-${diagramSequence}`, source)
    return DOMPurify.sanitize(result.svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
    })
  })

  renderQueue = task.then(() => undefined, () => undefined)
  return task
}

interface MermaidDiagramProps {
  dark: boolean
  errorMessage: string
  source: string
}

export function MermaidDiagram({ dark, errorMessage, source }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setSvg(undefined)
    setFailed(false)

    renderDiagram(source, dark).then(
      (result) => {
        if (active) setSvg(result)
      },
      () => {
        if (active) setFailed(true)
      },
    )

    return () => {
      active = false
    }
  }, [dark, source])

  if (failed) return <Alert type="error" showIcon message={errorMessage} />
  if (!svg) return <Skeleton.Node active style={{ width: '100%', height: 180 }} />

  return (
    <div
      aria-label="Mermaid diagram"
      role="img"
      style={{ maxWidth: '100%', overflowX: 'auto', textAlign: 'center' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
