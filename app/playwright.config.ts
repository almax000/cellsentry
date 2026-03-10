import { defineConfig } from '@playwright/test'
import { join } from 'path'

const reportDir = join(__dirname, '..', 'test_evidence', 'e2e-report')

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: reportDir, open: 'never' }]
  ],
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'on-first-retry'
  },
  projects: [
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/
    },
    {
      name: 'functional',
      testMatch: /functional\.spec\.ts/
    },
    {
      name: 'flow',
      testMatch: /flow\.spec\.ts/
    },
    {
      name: 'pii',
      testMatch: /pii\.spec\.ts/
    },
    {
      name: 'extraction',
      testMatch: /extraction\.spec\.ts/
    }
  ]
})
