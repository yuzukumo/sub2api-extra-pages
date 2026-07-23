import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DocumentService } from './document-service'

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sub2api-documents-'))
  await mkdir(join(directory, 'en-US', 'guide'), { recursive: true })
  await mkdir(join(directory, 'zh-CN', 'guide'), { recursive: true })
  await mkdir(join(directory, 'ru-RU', 'guide'), { recursive: true })
  await writeFile(join(directory, 'en-US', 'guide', 'start.md'), '# Start\n', 'utf8')
  await writeFile(join(directory, 'en-US', 'advanced.md'), '# Advanced\n', 'utf8')
  await writeFile(join(directory, 'zh-CN', 'guide', 'start.md'), '# 开始\n', 'utf8')
  await writeFile(join(directory, 'zh-CN', 'advanced.md'), '# 进阶\n', 'utf8')
  await writeFile(join(directory, 'ru-RU', 'guide', 'start.md'), '# Начало работы\n', 'utf8')
  await writeFile(join(directory, 'ru-RU', 'advanced.md'), '# Дополнительно\n', 'utf8')
  await writeFile(join(directory, 'documents.json'), JSON.stringify({
    title: {
      'en-US': 'Help Center',
      'zh-CN': '帮助中心',
      'zh-TW': '說明中心',
      'ru-RU': 'Справочный центр',
    },
    documents: [
      { file: 'guide/start.md' },
      { file: 'advanced.md' },
    ],
  }), 'utf8')
  return directory
}

describe('DocumentService', () => {
  it('preserves manifest order and loads a selected document', async () => {
    const directory = await createFixture()
    const service = new DocumentService(join(directory, 'documents.json'))

    try {
      const navigation = await service.getNavigation('en-US')
      const document = await service.getDocument('guide/start.md', 'en-US')

      expect(navigation.documents.map((item) => item.file)).toEqual(['guide/start.md', 'advanced.md'])
      expect(document).toMatchObject({
        file: 'guide/start.md',
        title: 'Start',
        content: '# Start\n',
        assetBase: 'en-US/guide/',
      })

      const chineseNavigation = await service.getNavigation('zh-CN')
      const chineseDocument = await service.getDocument('guide/start.md', 'zh-CN')
      expect(chineseNavigation.title).toBe('帮助中心')
      expect(chineseNavigation.documents[0]?.title).toBe('开始')
      expect(chineseDocument?.content).toBe('# 开始\n')

      const russianNavigation = await service.getNavigation('ru-RU')
      const russianDocument = await service.getDocument('guide/start.md', 'ru-RU')
      expect(russianNavigation.title).toBe('Справочный центр')
      expect(russianNavigation.documents[0]?.title).toBe('Начало работы')
      expect(russianDocument?.content).toBe('# Начало работы\n')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('rejects document paths outside the content directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sub2api-documents-'))
    const outsideFile = join(directory, '..', 'outside.md')
    await writeFile(outsideFile, '# Outside\n', 'utf8')
    await writeFile(join(directory, 'documents.json'), JSON.stringify({
      documents: [{ file: '../outside.md' }],
    }), 'utf8')
    const service = new DocumentService(join(directory, 'documents.json'))

    try {
      await expect(service.getDocument('../outside.md', 'en-US')).rejects.toThrow('locale directory')
    } finally {
      await rm(directory, { force: true, recursive: true })
      await rm(outsideFile, { force: true })
    }
  })
})
