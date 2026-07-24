import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  publicDir: 'content',
  plugins: [react()],
  build: {
    copyPublicDir: false,
  },
  server: {
    host: '0.0.0.0',
    port: 4174,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
  },
  test: {
    environment: 'node',
  },
})
