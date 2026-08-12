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

export function isSafeDocumentPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false

  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

export function getDocumentAssetBase(locale: string, file: string): string {
  const separator = file.lastIndexOf('/')
  const directory = separator === -1 ? '' : file.slice(0, separator + 1)
  return `${locale}/${directory}`
}

function contentUrl(path: string): string {
  const suffixIndex = path.search(/[?#]/)
  const pathname = suffixIndex === -1 ? path : path.slice(0, suffixIndex)
  const suffix = suffixIndex === -1 ? '' : path.slice(suffixIndex)
  const prefix = import.meta.env.DEV ? '' : 'content/'
  const encodedPath = pathname.split('/').map(encodeURIComponent).join('/')
  return `${import.meta.env.BASE_URL}${prefix}${encodedPath}${suffix}`
}

export function resolveDocumentUrl(file: string, locale = ''): string {
  return contentUrl(locale ? `${locale}/${file}` : file)
}

export function resolveContentUrl(
  url: string | undefined,
  assetBase = '',
): string | undefined {
  if (!url || url.startsWith('#') || url.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return url
  }

  const relativePath = url.replace(/^(\.\.\/|\.\/)+/, '')
  return contentUrl(`${assetBase}${relativePath}`)
}

export function resolveVideoContentUrl(
  url: string | undefined,
  assetBase = '',
): string | undefined {
  const path = url?.trim()
  if (
    !path
    || path.startsWith('/')
    || path.startsWith('\\')
    || path.startsWith('//')
    || path.includes('\\')
    || /[\r\n]/.test(path)
    || path.includes('?')
    || path.includes('#')
    || /^[a-z][a-z\d+.-]*:/i.test(path)
  ) {
    return undefined
  }

  const segments = assetBase.split('/').filter(Boolean)
  for (const rawSegment of path.split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return undefined
    }

    if (segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return undefined
      segments.pop()
      continue
    }
    if (!segment || segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
      return undefined
    }
    segments.push(segment)
  }

  return segments.length > 0 ? contentUrl(segments.join('/')) : undefined
}
