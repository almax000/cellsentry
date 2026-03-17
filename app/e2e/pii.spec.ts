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

// ── PII Scan Flow (unified) ─────────────────────────────────────────────

test.describe('PII Scan', () => {
  test('PII scan completes with findings', async () => {
    // Trigger unified scan (all 3 engines) via test API
    await page.evaluate((filePath) => {
      window.__TEST_API__?.triggerFileAnalysis(filePath)
      window.location.hash = '#/scanning'
    }, FIXTURE_PATH)

    // Wait for scan to complete and auto-navigate to results
    await page.waitForFunction(() => window.location.hash === '#/results', { timeout: 15000 })
    await page.waitForTimeout(300)

    // Switch to PII view via sidebar
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(500)

    // Verify PII results panel is visible
    await expect(page.locator('[data-testid="pii-results-panel-left"]')).toBeVisible({ timeout: 5000 })

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

    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
  })
})
