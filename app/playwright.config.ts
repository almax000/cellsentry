import { defineConfig } from '@playwright/test'
import { join } from 'path'

// v2 W1: removed pii / extraction / flow / functional projects with v1 engines.
// v2 W6: removed visual + sidebar-ux specs — they tested DropZone-area,
// sidebar engine items (Audit/PII/Extraction nav), and app-brand header
// icons that no longer exist post-pivot. v2 E2E coverage lives in `medical`
// covering the lean ingest → preview round-trip (collision panel + safety-net
// review revoked in 2026-04-27 lean rebuild).

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
      name: 'medical',
      testMatch: /medical\.spec\.ts/
    }
  ]
})
