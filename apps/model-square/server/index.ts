import 'dotenv/config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { CatalogService } from './catalog-service.js'
import { rateHistoryRanges, type RateHistoryRange } from './types.js'

const port = 3000
const host = process.env.HOST || '0.0.0.0'
const notice = process.env.NOTICE_MESSAGE?.trim() || undefined
const distRoot = resolve(process.env.STATIC_DIR || 'dist')

const catalogService = new CatalogService({
  cacheFile: process.env.CACHE_FILE || './data/catalog-cache.json',
  historyFile: process.env.HISTORY_FILE || './data/rate-history.json',
  sub2ApiUrl: process.env.SUB2API_URL?.trim() || undefined,
  sub2ApiAdminApiKey: process.env.SUB2API_ADMIN_API_KEY?.trim() || undefined,
})

await catalogService.initialize()

const app = Fastify({ logger: true })

app.get('/api/catalog', async (_request, reply) => {
  try {
    const { rateHistory: _rateHistory, ...catalog } = await catalogService.getCatalog()
    return { ...catalog, notice }
  } catch (error) {
    app.log.error(error)
    return reply.code(503).send({ message: 'Model catalog is temporarily unavailable' })
  }
})

app.get<{ Querystring: { groupId?: string; range?: string } }>('/api/rate-history', async (request, reply) => {
  const groupId = request.query.groupId?.trim()
  const range = parseRateHistoryRange(request.query.range)
  if (!groupId || !range) {
    return reply.code(400).send({ message: 'A valid groupId and range are required' })
  }

  try {
    return { points: await catalogService.getGroupRateHistory(groupId, range) }
  } catch (error) {
    app.log.error(error)
    return reply.code(503).send({ message: 'Rate history is temporarily unavailable' })
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

function parseRateHistoryRange(value: string | undefined): RateHistoryRange | undefined {
  if (value === undefined) return '24h'
  return rateHistoryRanges.find((range) => range === value)
}
