import { z } from 'zod'

export const navigationSchema = z.object({
  title: z.string().optional(),
  documents: z.array(z.object({
    file: z.string(),
    title: z.string(),
  })),
})

export const documentSchema = z.object({
  file: z.string(),
  title: z.string(),
  content: z.string(),
  assetBase: z.string(),
  updatedAt: z.string(),
})
