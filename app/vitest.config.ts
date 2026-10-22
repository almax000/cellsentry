import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 2,
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
