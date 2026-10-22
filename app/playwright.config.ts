import { defineConfig } from '@playwright/test'
import { join } from 'path'

const e2eTmpDir = join(__dirname, 'tmp', 'e2e')

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  outputDir: join(e2eTmpDir, 'artifacts'),
  reporter: [
    ['list'],
    ['html', { outputFolder: join(e2eTmpDir, 'report'), open: 'never' }]
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
    },
    {
      name: 'sidebar-ux',
      testMatch: /sidebar-ux\.spec\.ts/
    },
    {
      name: 'exports',
      testMatch: /export-roundtrip\.spec\.ts/
    },
    {
      name: 'cancellation',
      testMatch: /cancellation\.spec\.ts/
    },
    {
      name: 'redact',
      testMatch: /redact\.spec\.ts/
    }
  ]
})
