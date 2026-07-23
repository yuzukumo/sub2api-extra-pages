import { Marked } from 'marked'
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id'

export interface DocumentHeading {
  id: string
  level: number
  title: string
}

export interface DocumentAnchorItem {
  key: string
  href: string
  title: string
  children?: DocumentAnchorItem[]
}

export function extractHeadings(content: string): DocumentHeading[] {
  const parser = new Marked(gfmHeadingId())
  parser.parse(content)

  return getHeadingList().map((heading) => ({
    id: heading.id,
    level: heading.level,
    title: heading.raw,
  }))
}

export function buildAnchorItems(headings: DocumentHeading[]): DocumentAnchorItem[] {
  const roots: DocumentAnchorItem[] = []
  const stack: Array<{ level: number; item: DocumentAnchorItem }> = []

  for (const heading of headings) {
    const item: DocumentAnchorItem = {
      key: heading.id,
      href: `#${heading.id}`,
      title: heading.title,
    }

    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]?.item
    if (parent) {
      parent.children ??= []
      parent.children.push(item)
    } else {
      roots.push(item)
    }

    stack.push({ level: heading.level, item })
  }

  return roots
}

export function getDocumentTitle(headings: DocumentHeading[]): string | undefined {
  return headings.find((heading) => heading.level === 1)?.title
}

export function resolveContentUrl(
  url: string | undefined,
  assetBase = '',
): string | undefined {
  if (!url || url.startsWith('#') || url.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return url
  }

  const relativePath = url.replace(/^(\.\.\/|\.\/)+/, '')
  return `${import.meta.env.BASE_URL}content/${assetBase}${relativePath}`
}
