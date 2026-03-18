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

// ── Group 1: Sidebar Initial State ──────────────────────────────────────

test.describe('Sidebar: Initial state', () => {
  test('Home button visible with active class', async () => {
    const home = page.locator('[data-testid="sidebar-nav-home"]')
    await expect(home).toBeVisible()
    await expect(home).toHaveClass(/active/)
  })

  test('Engine items visible with disabled class', async () => {
    for (const id of ['audit', 'pii', 'extraction']) {
      const item = page.locator(`[data-testid="sidebar-nav-${id}"]`)
      await expect(item).toBeVisible()
      await expect(item).toHaveClass(/disabled/)
    }
  })

  test('Settings item visible and navigates to settings', async () => {
    const settings = page.locator('[data-testid="sidebar-nav-settings"]')
    await expect(settings).toBeVisible()
    await settings.click()
    await page.waitForTimeout(300)
    await expect(page.locator('.settings-container')).toBeVisible()
    // Navigate back to home
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(300)
  })

  test('Clicking disabled engine item does NOT navigate away from DropZone', async () => {
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
    // force: true bypasses Playwright's pointer-event check — the parent intercepts clicks,
    // but we still want to verify the app's onClick guard (isEngineEnabled) works
    await page.locator('[data-testid="sidebar-nav-audit"]').click({ force: true })
    await page.waitForTimeout(300)
    // Should still be on DropZone
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
  })
})

// ── Group 2: Post-Scan State ────────────────────────────────────────────

test.describe('Sidebar: Post-scan state', () => {
  test.beforeAll(async () => {
    // Trigger unified scan with combined fixture
    await page.evaluate((filePath) => {
      window.__TEST_API__?.triggerFileAnalysis(filePath)
      window.location.hash = '#/scanning'
    }, COMBINED_FIXTURE)

    // Wait for scan to complete and auto-navigate to results
    await page.waitForFunction(() => window.location.hash === '#/results', { timeout: 15000 })
    await page.waitForTimeout(500)
  })

  test('All 3 engine items lose disabled class', async () => {
    for (const id of ['audit', 'pii', 'extraction']) {
      const item = page.locator(`[data-testid="sidebar-nav-${id}"]`)
      await expect(item).not.toHaveClass(/disabled/)
    }
  })

  test('Badge counts > 0 on all 3 items', async () => {
    for (const id of ['audit', 'pii', 'extraction']) {
      const badge = page.locator(`[data-testid="sidebar-nav-${id}"] .sidebar-badge`)
      await expect(badge).toBeVisible()
      const text = await badge.textContent()
      expect(Number(text)).toBeGreaterThan(0)
    }
  })

  test('Audit sidebar item has active class on results page', async () => {
    await expect(page.locator('[data-testid="sidebar-nav-audit"]')).toHaveClass(/active/)
  })

  test('Home button does NOT have active class on results page', async () => {
    await expect(page.locator('[data-testid="sidebar-nav-home"]')).not.toHaveClass(/active/)
  })
})

// ── Group 3: View Switching on Results ──────────────────────────────────

test.describe('Sidebar: View switching', () => {
  test('Default view is audit (results-panel-left visible)', async () => {
    await expect(page.locator('[data-testid="results-panel-left"]')).toBeVisible()
  })

  test('Click PII → PII results panel visible', async () => {
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="pii-results-panel-left"]')).toBeVisible({ timeout: 3000 })
  })

  test('Click Extraction → Extraction results panel visible', async () => {
    await page.locator('[data-testid="sidebar-nav-extraction"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="extraction-results-panel-left"]')).toBeVisible({ timeout: 3000 })
  })

  test('Click Audit back → audit results panel visible again', async () => {
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="results-panel-left"]')).toBeVisible({ timeout: 3000 })
  })

  test('Active class follows the clicked item', async () => {
    // Currently on audit
    await expect(page.locator('[data-testid="sidebar-nav-audit"]')).toHaveClass(/active/)
    await expect(page.locator('[data-testid="sidebar-nav-pii"]')).not.toHaveClass(/active/)

    // Switch to PII
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="sidebar-nav-pii"]')).toHaveClass(/active/)
    await expect(page.locator('[data-testid="sidebar-nav-audit"]')).not.toHaveClass(/active/)

    // Switch back to audit for next group
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await page.waitForTimeout(300)
  })
})

// ── Group 4: Header Title Updates ───────────────────────────────────────

test.describe('Sidebar: Header titles', () => {
  test('On results (audit): header contains "Scan Results"', async () => {
    const h1 = page.locator('[data-testid="header-title"] h1')
    await expect(h1).toContainText('Scan Results')
  })

  test('Switch to PII: header contains "PII Results"', async () => {
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(300)
    const h1 = page.locator('[data-testid="header-title"] h1')
    await expect(h1).toContainText('PII Results')
  })

  test('Switch to Extraction: header contains "Extraction Results"', async () => {
    await page.locator('[data-testid="sidebar-nav-extraction"]').click()
    await page.waitForTimeout(300)
    const h1 = page.locator('[data-testid="header-title"] h1')
    await expect(h1).toContainText('Extraction Results')
  })

  test('Navigate to settings: header contains "Settings"', async () => {
    await page.locator('[data-testid="sidebar-nav-settings"]').click()
    await page.waitForTimeout(300)
    const h1 = page.locator('[data-testid="header-title"] h1')
    await expect(h1).toContainText('Settings')
  })
})

// ── Group 5: Home Round-Trip ────────────────────────────────────────────

test.describe('Sidebar: Home round-trip', () => {
  test('Click Home → DropZone visible, stays on DropZone (no redirect back)', async () => {
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
    // Wait extra to ensure no redirect fires
    await page.waitForTimeout(1000)
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
  })

  test('Engine items remain enabled after going Home', async () => {
    for (const id of ['audit', 'pii', 'extraction']) {
      const item = page.locator(`[data-testid="sidebar-nav-${id}"]`)
      await expect(item).not.toHaveClass(/disabled/)
    }
  })

  test('Click Audit from Home → lands on results with audit view', async () => {
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="results-panel-left"]')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="sidebar-nav-audit"]')).toHaveClass(/active/)
  })

  test('Click Home → click PII from Home → lands on results with PII view', async () => {
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()

    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="pii-results-panel-left"]')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="sidebar-nav-pii"]')).toHaveClass(/active/)
  })
})
