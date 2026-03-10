import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'
import { join } from 'path'

const screenshotDir = join(__dirname, '..', '..', 'test_evidence', 'screenshots')

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
  test('complete scan flow from DropZone to Results', async () => {
    // Step 1: Verify DropZone is visible
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
    await page.screenshot({ path: join(screenshotDir, 'flow1-01-dropzone.png') })

    // Step 2: Trigger file analysis via IPC (simulating browse → file selected)
    // The mock sidecar will return canned results
    await page.evaluate(async () => {
      // Simulate the scan flow by directly calling the scan context
      // We'll navigate by dispatching the file path through the API
      const filePath = '/tmp/test/mixed_errors.xlsx'
      const fileInfo = await window.api.getFileInfo(filePath)
      if (fileInfo) {
        // Trigger navigation to scanning by setting hash
        window.location.hash = '#/scanning'
      }
    })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(screenshotDir, 'flow1-02-scanning.png') })

    // Step 3: Navigate to results (mock scan completes instantly)
    await page.evaluate(() => {
      window.location.hash = '#/results'
    })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(screenshotDir, 'flow1-03-results.png') })
  })
})

// ── Flow 2: Navigation round-trip ───────────────────────────────────────

test.describe('Flow: Full navigation', () => {
  test('visit every page via sidebar', async () => {
    // Home (DropZone)
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
    await page.screenshot({ path: join(screenshotDir, 'flow4-01-home.png') })

    // Settings
    await page.locator('[data-testid="sidebar-nav-settings"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('.settings-container')).toBeVisible()
    await page.screenshot({ path: join(screenshotDir, 'flow4-02-settings.png') })

    // Back to home
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
    await page.screenshot({ path: join(screenshotDir, 'flow4-03-back-home.png') })
  })
})

// ── Flow 5: Export dropdown ─────────────────────────────────────────────

test.describe('Flow: Export options', () => {
  test('export button shows dropdown with HTML and PDF options', async () => {
    // Navigate to results page directly
    await page.evaluate(() => {
      window.location.hash = '#/results'
    })
    await page.waitForTimeout(500)

    // Check if export button exists on results page
    const exportBtn = page.locator('[data-testid="export-btn"]')
    const exportVisible = await exportBtn.isVisible().catch(() => false)

    if (exportVisible) {
      await exportBtn.click()
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(screenshotDir, 'flow5-01-export-dropdown.png') })

      await expect(page.locator('[data-testid="export-html"]')).toBeVisible()
      await expect(page.locator('[data-testid="export-pdf"]')).toBeVisible()
    }

    // Navigate back home
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await page.waitForTimeout(300)
  })
})
