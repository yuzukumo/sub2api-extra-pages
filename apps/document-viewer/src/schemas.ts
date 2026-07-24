import { z } from 'zod'
import { isSafeDocumentPath } from './lib/document'

const documentPathSchema = z.string()
  .trim()
  .min(1)
  .refine(isSafeDocumentPath, 'Document paths must stay inside a locale directory')

export const documentManifestSchema = z.object({
  title: z.object({
    'en-US': z.string().trim().min(1).optional(),
    'zh-CN': z.string().trim().min(1).optional(),
    'zh-TW': z.string().trim().min(1).optional(),
    'ru-RU': z.string().trim().min(1).optional(),
  }).refine((title) => Object.keys(title).length > 0, {
    message: 'At least one localized title is required when title is configured',
  }).optional(),
  documents: z.array(z.object({
    file: documentPathSchema,
  })).min(1),
}).superRefine((manifest, context) => {
  const files = new Set<string>()
  for (const [index, document] of manifest.documents.entries()) {
    if (files.has(document.file)) {
      context.addIssue({
        code: 'custom',
        message: 'Document files must be unique',
        path: ['documents', index, 'file'],
      })
    }
    files.add(document.file)
  }
})
