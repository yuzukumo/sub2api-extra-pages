import { describe, expect, it } from 'vitest'
import { documentManifestSchema } from './schemas'

describe('document manifest schema', () => {
  it('preserves valid document paths and rejects duplicates or traversal', () => {
    expect(documentManifestSchema.parse({
      documents: [{ file: 'guide/start.md' }],
    }).documents[0]?.file).toBe('guide/start.md')

    expect(() => documentManifestSchema.parse({
      documents: [{ file: 'start.md' }, { file: 'start.md' }],
    })).toThrow('Document files must be unique')

    expect(() => documentManifestSchema.parse({
      documents: [{ file: '../start.md' }],
    })).toThrow('Document paths must stay inside a locale directory')
  })
})
