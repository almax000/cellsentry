import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'
import { join } from 'path'

const COMBINED_FIXTURE = join(__dirname, 'fixtures', 'combined-test-data.xlsx')

let ctx: TestContext
let page: Page

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

// ── Flow 1: Single File Scan ────────────────────────────────────────────

test.describe('Flow: Single file scan', () => {
  test('complete scan flow from the home page to Results', async () => {
    // Step 1: Verify the task home page is visible
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()
    // Test-mode IPC follows the same ScanContext entry point as a selected file.
    await page.evaluate(async (filePath) => {
      await window.__TEST_API__?.triggerFileAnalysis(filePath)
    }, COMBINED_FIXTURE)
    await expect(page.locator('[data-testid="scanning-phase"]')).toBeVisible()
    await page.waitForFunction(() => window.location.hash === '#/results', { timeout: 30000 })
    await expect(page.locator('[data-testid="results-panel-left"]')).toBeVisible()
  })
})

// ── Flow 2: Navigation round-trip ───────────────────────────────────────

test.describe('Flow: Full navigation', () => {
  test('visit every page via sidebar', async () => {
    // Navigate to home first (in case previous test left us on /results)
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.waitForTimeout(300)

    // Home (task cards)
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()

    await page.locator('[data-testid="home-task-audit"]').click()
    await expect(page).toHaveURL(/#\/audit$/)
    await expect(page.locator('[data-testid="entry-audit"]')).toBeVisible()

    // Settings
    await page.locator('[data-testid="sidebar-nav-settings"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('.settings-container')).toBeVisible()

    // Back to home
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()
  })
})

// ── Flow 5: Export dropdown ─────────────────────────────────────────────

test.describe('Flow: Export options', () => {
  test('export menu offers HTML, PDF, and marked workbook', async () => {
    await page.evaluate((filePath) => window.__TEST_API__?.triggerFileAnalysis(filePath), COMBINED_FIXTURE)
    await page.waitForFunction(() => window.location.hash === '#/results', { timeout: 30000 })
    await expect(page.locator('[data-testid="export-btn"]')).toBeVisible()
    await page.locator('[data-testid="export-btn"]').click()
    await expect(page.locator('[data-testid="export-html"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-pdf"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-xlsx"]')).toBeVisible()

    // Navigate back home
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(300)
  })
})
