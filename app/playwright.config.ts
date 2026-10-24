import { defineConfig } from '@playwright/test'
import { join } from 'path'

const e2eTmpDir = join(__dirname, 'tmp', 'e2e')

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  // Stop on the first failure: a blocked Electron launch must not queue a series of macOS crash dialogs.
  maxFailures: 1,
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
    { name: 'visual', testMatch: /visual\.spec\.ts/ },
    { name: 'functional', testMatch: /[\\/]functional\.spec\.ts$/ },
    { name: 'flow', testMatch: /flow\.spec\.ts/ },
    { name: 'sidebar-audit', testMatch: /sidebar-audit\.spec\.ts/ },
    { name: 'exports', testMatch: /export-roundtrip\.spec\.ts/ },
    { name: 'cancellation', testMatch: /cancellation\.spec\.ts/ },
    { name: 'audit-budget', testMatch: /audit-budget-functional\.spec\.ts/ },
    { name: 'model-setup', testMatch: /model-setup-functional\.spec\.ts/ },
    { name: 'offline-model', testMatch: /offline-model-functional\.spec\.ts/ },
    // Document redaction, extraction, and standalone-PII specs remain in e2e/
    // as Vibli migration references, outside CellSentry's default product run.
    {
      name: 'audit',
      testMatch: /audit-only\.spec\.ts/
    }
  ]
})
