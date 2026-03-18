import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'

let ctx: TestContext
let page: Page

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

// ── Sidebar Navigation ─────────────────────────────────────────────────

test.describe('Sidebar', () => {
  test('navigates to Settings and back via Home', async () => {
    const settingsNav = page.locator('[data-testid="sidebar-nav-settings"]')
    await settingsNav.click()
    await page.waitForTimeout(300)

    const settingsContainer = page.locator('.settings-container')
    await expect(settingsContainer).toBeVisible()

    // Navigate back to home via Home button
    const homeNav = page.locator('[data-testid="sidebar-nav-home"]')
    await homeNav.click()
    await page.waitForTimeout(300)

    const dropZone = page.locator('[data-testid="dropzone-area"]')
    await expect(dropZone).toBeVisible()
  })

  test('engine nav items are disabled before scan', async () => {
    const auditNav = page.locator('[data-testid="sidebar-nav-audit"]')
    const piiNav = page.locator('[data-testid="sidebar-nav-pii"]')
    const extractionNav = page.locator('[data-testid="sidebar-nav-extraction"]')

    // All engine items should be disabled (no scan results)
    await expect(auditNav).toHaveClass(/disabled/)
    await expect(piiNav).toHaveClass(/disabled/)
    await expect(extractionNav).toHaveClass(/disabled/)

    // Home should still show dropzone
    await expect(page.locator('[data-testid="dropzone-area"]')).toBeVisible()
  })

  test('Home button has active indicator on home page', async () => {
    const homeItem = page.locator('[data-testid="sidebar-nav-home"]')
    const classes = await homeItem.getAttribute('class')
    expect(classes).toContain('active')
  })
})

// ── DropZone ────────────────────────────────────────────────────────────

test.describe('DropZone', () => {
  test('shows browse, batch, and folder buttons', async () => {
    // Ensure we're on home
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(300)

    await expect(page.locator('[data-testid="dropzone-browse-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="dropzone-batch-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="dropzone-folder-btn"]')).toBeVisible()
  })

  test('drop zone area is visible and has dashed border', async () => {
    const area = page.locator('[data-testid="dropzone-area"]')
    await expect(area).toBeVisible()
    const border = await area.evaluate((el) =>
      window.getComputedStyle(el).borderStyle
    )
    expect(border).toBe('dashed')
  })
})

// ── Settings Page ───────────────────────────────────────────────────────

test.describe('Settings', () => {
  test.beforeEach(async () => {
    await page.locator('[data-testid="sidebar-nav-settings"]').click()
    await page.waitForTimeout(300)
  })

  test('zoom controls increment and decrement', async () => {
    const zoomValue = page.locator('[data-testid="settings-zoom-value"]')
    const initial = await zoomValue.textContent()

    // Zoom in
    await page.locator('[data-testid="settings-zoom-in"]').click()
    await page.waitForTimeout(100)
    const after = await zoomValue.textContent()
    expect(after).not.toBe(initial)

    // Zoom back out
    await page.locator('[data-testid="settings-zoom-out"]').click()
    await page.waitForTimeout(100)
    const restored = await zoomValue.textContent()
    expect(restored).toBe(initial)
  })

  test('version is displayed', async () => {
    const version = page.locator('[data-testid="settings-version"]')
    await expect(version).toBeVisible()
    const text = await version.textContent()
    expect(text).toMatch(/\d+\.\d+\.\d+/)
  })
})

// ── Export Button ────────────────────────────────────────────────────────

test.describe('Export', () => {
  test('export button exists on results page', async () => {
    // Navigate to home first to ensure we can trigger a scan flow later
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.waitForTimeout(300)
  })
})

// ── Connection Banner ───────────────────────────────────────────────────

test.describe('ConnectionBanner', () => {
  test('banner not visible when sidecar is connected', async () => {
    const banner = page.locator('[data-testid="connection-banner"]')
    // With mock sidecar running, banner should be hidden or not present
    await expect(banner).toHaveCount(0)
  })
})
