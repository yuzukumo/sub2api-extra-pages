import { describe, expect, it } from 'vitest'
import {
  buildAnchorItems,
  extractHeadings,
  getDocumentAssetBase,
  getDocumentTitle,
  isSafeDocumentPath,
  resolveContentUrl,
  resolveDocumentUrl,
  resolveVideoContentUrl,
} from './document'

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

  it('maps relative assets to the configured content location', () => {
    expect(resolveContentUrl('./images/guide.png')).toContain('images/guide.png')
    expect(resolveContentUrl('./diagram.png', 'guides/')).toContain('guides/diagram.png')
    expect(resolveDocumentUrl('documents.json')).toContain('documents.json')
    expect(resolveDocumentUrl('introduction.md', 'en-US')).toContain('en-US/introduction.md')
    expect(resolveContentUrl('https://example.com/guide.png')).toBe('https://example.com/guide.png')
    expect(resolveContentUrl('#start')).toBe('#start')
  })

  it('accepts only document paths that stay inside a locale directory', () => {
    expect(isSafeDocumentPath('guides/start.md')).toBe(true)
    expect(isSafeDocumentPath('../start.md')).toBe(false)
    expect(isSafeDocumentPath('/start.md')).toBe(false)
    expect(isSafeDocumentPath('guides/../start.md')).toBe(false)
    expect(isSafeDocumentPath('guides\\start.md')).toBe(false)
    expect(getDocumentAssetBase('en-US', 'guides/start.md')).toBe('en-US/guides/')
  })

  it('resolves video sources only when they stay inside content', () => {
    expect(resolveVideoContentUrl('./media/overview.mp4', 'en-US/guides/'))
      .toContain('en-US/guides/media/overview.mp4')
    expect(resolveVideoContentUrl('../media/overview.webm', 'en-US/guides/'))
      .toContain('en-US/media/overview.webm')
    expect(resolveVideoContentUrl('../../media/overview.ogv', 'en-US/guides/'))
      .toContain('media/overview.ogv')

    expect(resolveVideoContentUrl('https://example.com/overview.mp4', 'en-US/')).toBeUndefined()
    expect(resolveVideoContentUrl('//example.com/overview.mp4', 'en-US/')).toBeUndefined()
    expect(resolveVideoContentUrl('/media/overview.mp4', 'en-US/')).toBeUndefined()
    expect(resolveVideoContentUrl('data:video/mp4;base64,abc', 'en-US/')).toBeUndefined()
    expect(resolveVideoContentUrl('../../../overview.mp4', 'en-US/guides/')).toBeUndefined()
    expect(resolveVideoContentUrl('%2e%2e/%2e%2e/%2e%2e/overview.mp4', 'en-US/guides/')).toBeUndefined()
    expect(resolveVideoContentUrl('./overview.mp4\nhttps://example.com/video.mp4', 'en-US/')).toBeUndefined()
  })
})
