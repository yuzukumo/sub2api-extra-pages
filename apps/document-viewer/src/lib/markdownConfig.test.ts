import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { createMarkdownConfig } from './markdownConfig'

describe('Markdown configuration', () => {
  it('keeps video fenced blocks identifiable for the custom renderer', () => {
    const markdown = new Marked(createMarkdownConfig())
    const html = markdown.parse('```video\n./media/overview.mp4\n```')

    expect(html).toContain('language-video')
    expect(html).toContain('./media/overview.mp4')
  })
})
