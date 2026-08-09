import 'dotenv/config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { CatalogService } from './catalog-service.js'

const port = 3000
const host = process.env.HOST || '0.0.0.0'
const notice = process.env.NOTICE_MESSAGE?.trim() || undefined
const distRoot = resolve(process.env.STATIC_DIR || 'dist')

const catalogService = new CatalogService({
  cacheFile: process.env.CACHE_FILE || './data/catalog-cache.json',
  sub2ApiUrl: process.env.SUB2API_URL?.trim() || undefined,
  sub2ApiAdminApiKey: process.env.SUB2API_ADMIN_API_KEY?.trim() || undefined,
})

await catalogService.initialize()

const app = Fastify({ logger: true })

app.get('/api/catalog', async (_request, reply) => {
  try {
    const catalog = await catalogService.getCatalog()
    return { ...catalog, notice }
  } catch (error) {
    app.log.error(error)
    return reply.code(503).send({ message: 'Model catalog is temporarily unavailable' })
  }
})

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
