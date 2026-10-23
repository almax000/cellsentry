import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { ModelDownloadFailureReason, ModelDownloadResult } from '../shared/modelDownload'

const SCREENSHOT_ROOT = join(__dirname, '..', 'tmp', 'e2e')
mkdirSync(SCREENSHOT_ROOT, { recursive: true })
const SCREENSHOT_DIR = mkdtempSync(join(SCREENSHOT_ROOT, 'model-setup-functional-'))

async function setWindowSize(ctx: TestContext, width: number, height: number): Promise<void> {
  await ctx.app.evaluate(({ BrowserWindow }, bounds) => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('No Electron window is available')
    window.setSize(bounds.width, bounds.height)
  }, { width, height })
}

async function stubDownload(ctx: TestContext, result: ModelDownloadResult): Promise<void> {
  // Transport is deliberately stubbed at the Electron IPC boundary. The modal,
  // Settings navigation and close action below remain the real renderer UI.
  await ctx.app.evaluate(({ ipcMain }, response) => {
    ipcMain.removeHandler('sidecar:model-download')
    ipcMain.handle('sidecar:model-download', async () => response)
    ipcMain.removeHandler('sidecar:model-status')
    ipcMain.handle('sidecar:model-status', async () => ({
      downloadAvailable: true, exists: false, loaded: false, available: false,
      backend: 'none', name: 'Synthetic configured source', size: '1.56 GB',
    }))
  }, result)
}

async function stubCancelledImport(ctx: TestContext): Promise<void> {
  await ctx.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('sidecar:model-import')
    ipcMain.handle('sidecar:model-import', async () => ({ success: false, cancelled: true }))
  })
}

type FailureCase = {
  reason: ModelDownloadFailureReason
  language: 'en' | 'zh'
  expectedGuidance: RegExp
  expectedRulesOnly: RegExp
}

const failureCases: FailureCase[] = [
  {
    reason: 'access_denied',
    language: 'en',
    expectedGuidance: /Automatic download needs authorized access/,
    expectedRulesOnly: /Not installed/,
  },
  {
    reason: 'source_unavailable',
    language: 'zh',
    expectedGuidance: /自动下载来源当前不可用/,
    expectedRulesOnly: /未安装/,
  },
  {
    reason: 'other',
    language: 'en',
    expectedGuidance: /Automatic download did not finish/,
    expectedRulesOnly: /Not installed/,
  },
]

for (const scenario of failureCases) {
  test(`model setup gives an actionable ${scenario.reason} path at 800x600`, async () => {
    const ctx = await launchApp()
    try {
      const { page } = ctx
      await stubDownload(ctx, {
        success: false,
        error: 'Automatic model download is unavailable',
        failureReason: scenario.reason,
      })
      await setWindowSize(ctx, 800, 600)
      await page.getByTestId('sidebar-nav-settings').click()
      await page.getByTestId('settings-lang-select').selectOption(scenario.language)
      await page.getByTestId('settings-setup-model').click()
      await page.getByTestId('model-download-start').click()

      const guidance = page.getByTestId('model-download-guidance')
      await expect(guidance).toContainText(scenario.expectedGuidance)
      await expect(guidance).toContainText(/cellsentry-minicpm5-2b-cancel2-q4_k_m\.gguf/)
      await expect(guidance).toContainText(/1\.56 (GB|GB）)/)
      await expect(page.getByTestId('model-import-start')).toBeVisible()
      await expect(page.getByTestId('model-download-close')).toBeVisible()
      const importButton = page.getByTestId('model-import-start')
      const downloadButton = page.getByTestId('model-download-start')
      if (scenario.reason === 'other') {
        await expect(downloadButton).toHaveClass(/btn-primary/)
        await expect(importButton).toHaveClass(/btn-secondary/)
      } else {
        await expect(importButton).toHaveClass(/btn-primary/)
        await expect(downloadButton).toHaveClass(/btn-secondary/)
      }
      await page.screenshot({
        path: join(SCREENSHOT_DIR, `${scenario.reason}-${scenario.language}-800x600.png`),
        animations: 'disabled',
      })

      if (scenario.reason === 'source_unavailable') {
        await stubCancelledImport(ctx)
        await importButton.click()
        await expect(page.getByTestId('model-download-guidance')).toHaveCount(0)
        await expect(page.getByTestId('model-download-start')).toBeVisible()
      }

      await page.getByTestId('model-download-close').click()
      await expect(page.locator('.settings-container')).toBeVisible()
      await expect(page.getByTestId('settings-ai-status')).toContainText(scenario.expectedRulesOnly)
      // The core promise still holds after a failed setup: built-in checks work without the assistant.
      await expect(page.locator('.settings-container')).toContainText(
        scenario.language === 'zh' ? /不装也能正常使用全部内置检查/ : /every built-in check works without it/
      )
    } finally {
      await teardownApp(ctx)
    }
  })
}
