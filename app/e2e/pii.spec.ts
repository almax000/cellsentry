import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'
import { join } from 'path'

const FIXTURE_PATH = join(__dirname, 'fixtures', 'pii-test-data.xlsx')

let ctx: TestContext
let page: Page

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

// ── PII DropZone ──────────────────────────────────────────────────────────

test.describe('PII DropZone', () => {
  test('PII DropZone is visible', async () => {
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(300)

    await expect(page.locator('[data-testid="pii-dropzone-area"]')).toBeVisible()
  })

  test('PII DropZone has browse button', async () => {
    await expect(page.locator('[data-testid="pii-dropzone-browse-btn"]')).toBeVisible()
  })
})

// ── PII Scan Flow ─────────────────────────────────────────────────────────

test.describe('PII Scan', () => {
  test('PII scan completes with findings', async () => {
    // Navigate to PII page
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(300)

    // Trigger PII scan and navigate to scanning page
    await page.evaluate((filePath) => {
      window.__TEST_API__?.triggerPiiScan(filePath)
      window.location.hash = '#/pii/scanning'
    }, FIXTURE_PATH)

    // Wait for results page (ScanningPage auto-navigates on complete)
    await page.waitForSelector('[data-testid="pii-results-panel-left"]', { timeout: 15000 })

    // Verify at least one finding card exists
    await expect(page.locator('[data-testid="pii-finding-card-0"]')).toBeVisible()
  })

  test('PII type summary shows chips', async () => {
    const typeSummary = page.locator('[data-testid="pii-type-summary"]')
    await expect(typeSummary).toBeVisible()

    // Should have at least email and phone type chips
    const chips = typeSummary.locator('.pii-type-chip')
    const chipCount = await chips.count()
    expect(chipCount).toBeGreaterThanOrEqual(2)
  })

  test('PII finding card shows type badge and masked value', async () => {
    const firstCard = page.locator('[data-testid="pii-finding-card-0"]')
    await expect(firstCard).toBeVisible()

    // Type badge should be visible
    await expect(firstCard.locator('.pii-type-badge')).toBeVisible()

    // Masked value should be visible
    await expect(firstCard.locator('.pii-finding-value')).toBeVisible()
  })

  test('PII rescan navigates back to DropZone', async () => {
    await page.locator('[data-testid="pii-results-rescan-btn"]').click()
    await page.waitForTimeout(300)

    await expect(page.locator('[data-testid="pii-dropzone-area"]')).toBeVisible()
  })
})
