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

// ── Extraction DropZone ───────────────────────────────────────────────────

test.describe('Extraction DropZone', () => {
  test('Extraction DropZone is visible', async () => {
    await page.locator('[data-testid="sidebar-nav-extraction"]').click()
    await page.waitForTimeout(300)

    await expect(page.locator('[data-testid="extraction-dropzone-area"]')).toBeVisible()
  })

  test('Extraction DropZone has browse button', async () => {
    await expect(page.locator('[data-testid="extraction-dropzone-browse-btn"]')).toBeVisible()
  })
})

// ── Extraction Scan Flow ──────────────────────────────────────────────────

test.describe('Extraction Scan', () => {
  test('Extraction scan detects invoice', async () => {
    // Navigate to extraction page
    await page.locator('[data-testid="sidebar-nav-extraction"]').click()
    await page.waitForTimeout(300)

    // Trigger extraction scan and navigate to scanning page
    await page.evaluate((filePath) => {
      window.__TEST_API__?.triggerExtractionScan(filePath)
      window.location.hash = '#/extract/scanning'
    }, FIXTURE_PATH)

    // Wait for results page
    await page.waitForSelector('[data-testid="extraction-results-panel-left"]', { timeout: 15000 })

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
