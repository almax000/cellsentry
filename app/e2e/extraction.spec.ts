import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'
import { join } from 'path'

const FIXTURE_PATH = join(__dirname, 'fixtures', 'invoice-test-data.xlsx')

let ctx: TestContext
let page: Page

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

// ── Extraction Scan Flow (unified) ──────────────────────────────────────

test.describe('Extraction Scan', () => {
  test('Extraction scan detects invoice', async () => {
    // Trigger unified scan (all 3 engines) via test API
    await page.evaluate((filePath) => {
      window.__TEST_API__?.triggerFileAnalysis(filePath)
      window.location.hash = '#/scanning'
    }, FIXTURE_PATH)

    // Wait for scan to complete and auto-navigate to results
    await page.waitForFunction(() => window.location.hash === '#/results', { timeout: 15000 })
    await page.waitForTimeout(300)

    // Switch to Extraction view via sidebar
    await page.locator('[data-testid="sidebar-nav-extraction"]').click()
    await page.waitForTimeout(500)

    // Verify extraction results panel is visible
    await expect(page.locator('[data-testid="extraction-results-panel-left"]')).toBeVisible({ timeout: 5000 })

    // Document type should show invoice
    const docType = page.locator('[data-testid="extraction-doc-type"]')
    await expect(docType).toBeVisible()
  })

  test('Extraction fields are extracted', async () => {
    // At least one field card should be visible
    await expect(page.locator('[data-testid="extraction-field-card-0"]')).toBeVisible()
  })

  test('Extraction table detected', async () => {
    await expect(page.locator('[data-testid="extraction-table-card-0"]')).toBeVisible()
  })

  test('Extraction export buttons exist', async () => {
    await expect(page.locator('[data-testid="extraction-export-json-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="extraction-export-csv-btn"]')).toBeVisible()
  })
})
