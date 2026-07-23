import { Children, type PropsWithChildren, useLayoutEffect, useRef, useState } from 'react'
import { Flex } from 'antd'
import { getCardGridLayout } from '../lib/cardGrid'

interface ResponsiveCardGridProps {
  gap: number
}

export function ResponsiveCardGrid({ gap, children }: PropsWithChildren<ResponsiveCardGridProps>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = (width: number) => {
      setContainerWidth((current) => (Math.abs(current - width) < 0.5 ? current : width))
    }

    updateWidth(container.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateWidth(entry.contentRect.width)
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  const measured = containerWidth > 0
  const layout = getCardGridLayout(containerWidth, { gap })

  return (
    <Flex ref={containerRef} style={{ width: '100%' }}>
      <Flex
        wrap
        gap={gap}
        align="stretch"
        style={{
          width: measured ? layout.gridWidth : '100%',
          maxWidth: '100%',
          marginInline: 'auto',
        }}
      >
        {Children.map(children, (child) => (
          <Flex
            vertical
            style={{
              flex: measured ? `0 0 ${layout.cardWidth}px` : '1 1 100%',
              minWidth: 0,
            }}
          >
            {child}
          </Flex>
        ))}
      </Flex>
    </Flex>
  )
}
