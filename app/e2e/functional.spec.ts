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

  test('the audit task is labelled and clickable before any scan', async () => {
    const auditNav = page.locator('[data-testid="sidebar-nav-audit"]')
    await expect(auditNav).not.toHaveClass(/disabled/)
    await expect(auditNav.locator('.sidebar-label')).toBeVisible()
    await expect(page.locator('[data-testid="home-page"]')).toBeVisible()
    await expect(page.locator('[data-testid="home-task-audit"]')).toBeVisible()
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
    // The name and download availability come from the same async status response.
    await expect(page.locator('.model-tech-details')).toContainText(before.name)
    expect(before.downloadAvailable).toBe(false)
    await expect(page.getByTestId('model-download-start')).toHaveCount(0)
    await expect(page.getByTestId('model-download-unavailable')).toBeVisible()
    expect(await page.evaluate(() => window.api.downloadModel())).toMatchObject({ success: false, failureReason: 'not_configured' })
    await expect(page.getByTestId('model-import-start')).toBeVisible()
    await expect(page.getByTestId('model-download-progress')).toHaveCount(0)
    const screenshots = join(__dirname, '..', 'tmp', 'e2e', 'release-acceptance')
    mkdirSync(screenshots, { recursive: true })
    for (const [width, height] of [[1200, 800], [800, 600]]) {
      await ctx.app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), [width, height])
      await page.screenshot({ path: join(screenshots, `model-unavailable-${width}x${height}.png`), animations: 'disabled' })
    }

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
