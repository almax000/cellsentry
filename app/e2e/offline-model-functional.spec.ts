import { test, expect } from '@playwright/test'
import { launchApp, teardownApp } from './electron.setup'

for (const phase of ['copying', 'failed'] as const) {
  test(`offline model ${phase} is visible while deterministic tools remain available`, async ({}, testInfo) => {
    const ctx = await launchApp()
    try {
      await ctx.app.evaluate(({ ipcMain }, currentPhase) => {
        ipcMain.removeHandler('sidecar:model-status')
        ipcMain.handle('sidecar:model-status', async () => ({
          downloadAvailable: false, exists: false, loaded: false, available: false, backend: 'none',
          name: 'Local formula model', size: '1.56 GB',
          error: currentPhase === 'failed' ? 'Insufficient disk space for offline model installation' : undefined,
          setup: { phase: currentPhase, copiedBytes: 52, totalBytes: 100 },
        }))
      }, phase)
      await ctx.page.reload()
      await expect(ctx.page.getByTestId('home-task-pii')).toBeEnabled()
      if (phase === 'copying') {
        await expect(ctx.page.getByTestId('model-setup-status')).toContainText('52%')
      }
      await ctx.page.setViewportSize({ width: 800, height: 600 })
      await ctx.page.screenshot({ path: testInfo.outputPath(`${phase}-home-800.png`), animations: 'disabled' })
      await ctx.page.getByTestId('home-task-pii').click()
      await ctx.page.getByTestId('redact-paste-toggle').click()
      await ctx.page.getByTestId('redact-paste-input').fill('联系电话：13912345678')
      await ctx.page.getByTestId('redact-paste-start').click()
      await expect(ctx.page.getByTestId('redact-review')).toBeVisible()
      await expect(ctx.page.getByTestId('redact-preview-text')).not.toContainText('13912345678')
      if (phase === 'failed') {
        await ctx.page.getByTestId('model-setup-failed').getByRole('button').click()
      } else await ctx.page.getByTestId('sidebar-nav-settings').click()
      if (phase === 'copying') {
        await expect(ctx.page.getByTestId('settings-setup-model')).toBeDisabled()
      } else {
        await expect(ctx.page.getByTestId('settings-ai-status')).toContainText(/Preparation failed|准备失败/)
        await expect(ctx.page.getByTestId('settings-setup-model')).toBeEnabled()
        await expect(ctx.page.locator('.settings-row-main[role="status"]')).toContainText(/free up disk space|释放磁盘空间/i)
      }
      await expect.poll(() => ctx.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await ctx.page.screenshot({ path: testInfo.outputPath(`${phase}-settings-800.png`), animations: 'disabled' })
      await ctx.page.getByTestId('settings-lang-select').selectOption('zh')
      await ctx.page.screenshot({ path: testInfo.outputPath(`${phase}-settings-zh-800.png`), animations: 'disabled' })
    } finally { await teardownApp(ctx) }
  })
}
