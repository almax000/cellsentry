import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', 'out/**', 'dist/**'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['e2e/**', 'out/**', '**/*.config.*', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
