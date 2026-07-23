import { describe, expect, it } from 'vitest'
import { buildAnchorItems, extractHeadings, getDocumentTitle, resolveContentUrl } from './document'

describe('document helpers', () => {
  it('extracts unique heading anchors and builds a hierarchy', () => {
    const headings = extractHeadings('# Guide\n\n## Start\n\n### Install\n\n## Start\n')

    expect(headings.map((heading) => heading.id)).toEqual([
      'guide',
      'start',
      'install',
      'start-1',
    ])
    expect(buildAnchorItems(headings)[0]?.children?.map((item) => item.key)).toEqual([
      'start',
      'start-1',
    ])
    expect(getDocumentTitle(headings)).toBe('Guide')
  })

  it('maps relative assets to the mounted content directory', () => {
    expect(resolveContentUrl('./images/guide.png')).toContain('content/images/guide.png')
    expect(resolveContentUrl('./diagram.png', 'guides/')).toContain('content/guides/diagram.png')
    expect(resolveContentUrl('https://example.com/guide.png')).toBe('https://example.com/guide.png')
    expect(resolveContentUrl('#start')).toBe('#start')
  })
})
