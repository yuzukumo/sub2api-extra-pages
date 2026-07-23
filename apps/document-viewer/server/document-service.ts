import { readFile, stat } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { Lexer } from 'marked'
import { z } from 'zod'

const documentEntrySchema = z.object({
  file: z.string().trim().min(1),
})

const documentConfigSchema = z.object({
  title: z.object({
    'en-US': z.string().trim().min(1),
    'zh-CN': z.string().trim().min(1),
    'zh-TW': z.string().trim().min(1),
    'ru-RU': z.string().trim().min(1),
  }).optional(),
  documents: z.array(documentEntrySchema).min(1),
})

interface DocumentEntry {
  file: string
}

interface DocumentConfig {
  title?: Record<UiLocale, string>
  documents: DocumentEntry[]
}

export type UiLocale = 'en-US' | 'zh-CN' | 'zh-TW' | 'ru-RU'

export interface NavigationPayload {
  title?: string
  documents: Array<{ file: string, title: string }>
}

export interface DocumentPayload {
  file: string
  title: string
  content: string
  assetBase: string
  updatedAt: string
}

export class DocumentService {
  private readonly configFile: string
  private readonly contentRoot: string

  constructor(configFile: string) {
    this.configFile = resolve(configFile)
    this.contentRoot = dirname(this.configFile)
  }

  getContentRoot(): string {
    return this.contentRoot
  }

  async getNavigation(locale: UiLocale): Promise<NavigationPayload> {
    const config = await this.loadConfig()
    const documents = await Promise.all(config.documents.map(async (document) => {
      const content = await readFile(this.resolveLocalizedFile(locale, document.file), 'utf8')
      return {
        file: document.file,
        title: this.extractTitle(content, document.file),
      }
    }))

    return {
      title: config.title?.[locale],
      documents,
    }
  }

  async getDocument(configuredFile: string, locale: UiLocale): Promise<DocumentPayload | undefined> {
    const config = await this.loadConfig()
    const entry = config.documents.find((document) => document.file === configuredFile)
    if (!entry) return undefined

    const localeRoot = resolve(this.contentRoot, locale)
    const file = this.resolveLocalizedFile(locale, entry.file)
    const [content, metadata] = await Promise.all([
      readFile(file, 'utf8'),
      stat(file),
    ])

    if (!metadata.isFile()) {
      throw new Error(`Document path is not a file: ${entry.file}`)
    }

    const relativeDirectory = relative(localeRoot, dirname(file))
    const assetDirectory = relativeDirectory
      ? `${relativeDirectory.split(sep).join('/')}/`
      : ''

    return {
      file: entry.file,
      title: this.extractTitle(content, entry.file),
      content,
      assetBase: `${locale}/${assetDirectory}`,
      updatedAt: metadata.mtime.toISOString(),
    }
  }

  private async loadConfig(): Promise<DocumentConfig> {
    const raw = await readFile(this.configFile, 'utf8')
    const config = documentConfigSchema.parse(JSON.parse(raw))
    const files = new Set(config.documents.map((document) => document.file))
    if (files.size !== config.documents.length) {
      throw new Error('Document files must be unique')
    }
    return config
  }

  private resolveDocumentFile(localeRoot: string, configuredPath: string): string {
    const file = resolve(localeRoot, configuredPath)
    const relativePath = relative(localeRoot, file)
    if (relativePath.startsWith('..') || relativePath === '' || relativePath.startsWith(sep)) {
      throw new Error(`Document path must stay inside the locale directory: ${configuredPath}`)
    }
    return file
  }

  private resolveLocalizedFile(locale: UiLocale, configuredPath: string): string {
    return this.resolveDocumentFile(resolve(this.contentRoot, locale), configuredPath)
  }

  private extractTitle(content: string, configuredPath: string): string {
    const heading = Lexer.lex(content).find(
      (token) => token.type === 'heading' && token.depth === 1,
    )
    if (!heading || heading.type !== 'heading' || !heading.text.trim()) {
      throw new Error(`Document must contain a level-one heading: ${configuredPath}`)
    }
    return heading.text.trim()
  }
}
