import 'dotenv/config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { DocumentService } from './document-service.js'
import type { UiLocale } from './document-service.js'

const port = 3000
const host = process.env.HOST || '0.0.0.0'
const distRoot = resolve(process.env.STATIC_DIR || 'dist')
const documentService = new DocumentService(resolve('./content/documents.json'))
const supportedLocales = new Set<UiLocale>(['en-US', 'zh-CN', 'zh-TW', 'ru-RU'])

function resolveLocale(value?: string): UiLocale {
  return supportedLocales.has(value as UiLocale) ? value as UiLocale : 'en-US'
}

const app = Fastify({ logger: true })

app.get<{ Querystring: { locale?: string } }>('/api/navigation', async (request, reply) => {
  try {
    reply.header('Cache-Control', 'no-cache')
    return await documentService.getNavigation(resolveLocale(request.query.locale))
  } catch (error) {
    app.log.error(error)
    return reply.code(503).send({ message: 'Document navigation is temporarily unavailable' })
  }
})

app.get<{ Querystring: { file?: string, locale?: string } }>('/api/document', async (request, reply) => {
  try {
    reply.header('Cache-Control', 'no-cache')
    if (!request.query.file) {
      return reply.code(400).send({ message: 'Document file is required' })
    }
    const document = await documentService.getDocument(
      request.query.file,
      resolveLocale(request.query.locale),
    )
    if (!document) return reply.code(404).send({ message: 'Document not found' })
    return document
  } catch (error) {
    app.log.error(error)
    return reply.code(503).send({ message: 'Document is temporarily unavailable' })
  }
})

if (existsSync(documentService.getContentRoot())) {
  await app.register(fastifyStatic, {
    root: documentService.getContentRoot(),
    prefix: '/content/',
    decorateReply: false,
  })
}

if (existsSync(distRoot)) {
  await app.register(fastifyStatic, {
    root: distRoot,
    wildcard: false,
  })
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ message: 'Not Found' })
  })
}

await app.listen({ host, port })
