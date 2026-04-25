import { defineConfig } from '@playwright/test'
import { join } from 'path'

// v2 W1 Step 1.1: removed pii / extraction / flow / functional projects.
// Their spec files were deleted with v1.x engines. v2 medical-pipeline E2E
// tests will be added in W3-W5 (mapping editor, audit diff, multi-doc,
// regex-confirm, collision-warning).

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
      name: 'sidebar-ux',
      testMatch: /sidebar-ux\.spec\.ts/
    }
  ]
})
