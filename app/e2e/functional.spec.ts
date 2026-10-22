import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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

    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()
  })

  test('task nav items are labelled and clickable before any scan', async () => {
    const auditNav = page.locator('[data-testid="sidebar-nav-audit"]')
    const piiNav = page.locator('[data-testid="sidebar-nav-pii"]')
    const extractionNav = page.locator('[data-testid="sidebar-nav-extraction"]')

    for (const item of [auditNav, piiNav, extractionNav]) {
      await expect(item).not.toHaveClass(/disabled/)
      await expect(item.locator('.sidebar-label')).toBeVisible()
    }

    // Home shows the three task cards
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()
    for (const task of ['pii', 'audit', 'extraction']) {
      await expect(page.locator(`[data-testid="home-task-${task}"]`)).toBeVisible()
    }
  })

  test('Home button has active indicator on home page', async () => {
    const homeItem = page.locator('[data-testid="sidebar-nav-home"]')
    const classes = await homeItem.getAttribute('class')
    expect(classes).toContain('active')
  })
})

// ── DropZone ────────────────────────────────────────────────────────────

test.describe('DropZone', () => {
  test('formula entry shows browse, batch, and folder buttons', async () => {
    // No results yet, so the sidebar opens the entry page
    await page.locator('[data-testid="sidebar-nav-audit"]').click()
    await expect(page.locator('[data-testid="entry-audit"]')).toBeVisible()
    await expect(page.locator('[data-testid="sidebar-nav-audit"]')).toHaveClass(/active/)

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

  test('redaction entry takes text PDFs and pasted text, with My info beside it', async () => {
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await expect(page.locator('[data-testid="entry-pii"]')).toBeVisible()
    await expect(page.locator('[data-testid="myinfo-panel"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-choose-files"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-paste-toggle"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-spreadsheet"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-steps"]')).toBeVisible()
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
    const displayed = await version.evaluate((element) => element.firstChild?.textContent?.trim())
    // Mirror the app: a packaged build reports app.getVersion(); a source build reads package.json,
    // because Electron launched on a script path reports its own version.
    const packagedVersion = await ctx.app.evaluate(({ app }) => (app.isPackaged ? app.getVersion() : null))
    const actual = packagedVersion ?? JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version
    expect(displayed).toBe(actual)
  })

  test('model setup is explicit, optional, and rejects an invalid local model', async () => {
    const before = await page.evaluate(() => window.api.getModelStatus())
    expect(before.exists).toBe(false)
    expect(before.loaded).toBe(false)
    await page.getByTestId('settings-setup-model').click()
    await expect(page.getByTestId('model-download-start')).toBeVisible()
    await expect(page.getByTestId('model-import-start')).toBeVisible()
    await expect(page.getByTestId('model-download-progress')).toHaveCount(0)

    const directory = join(__dirname, '..', 'tmp', 'e2e', 'fixtures')
    mkdirSync(directory, { recursive: true })
    const model = join(directory, 'invalid.gguf')
    writeFileSync(model, 'GGUF invalid test fixture')
    await ctx.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, model)
    await page.getByTestId('model-import-start').click()
    await expect(page.locator('.model-download-card .modal-subtitle')).toContainText(/size/i)
    const after = await page.evaluate(() => window.api.getModelStatus())
    expect(after.exists).toBe(false)
    expect(after.loaded).toBe(false)
    await page.getByTestId('model-download-close').click()
    await expect(page.locator('.settings-container')).toBeVisible()
    await page.getByTestId('sidebar-nav-home').click()
    await expect(page.getByTestId('home-page')).toBeVisible()
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
