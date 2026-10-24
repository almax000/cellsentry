import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

const fixture = join(__dirname, 'fixtures', 'golden-three-workflows.xlsx')
const root = join(__dirname, '..', 'tmp', 'e2e', 'audit-budget')
mkdirSync(root, { recursive: true })
const evidence = mkdtempSync(join(root, 'controlled-ui-'))

async function prepare(ctx: TestContext, language: 'en' | 'zh'): Promise<void> {
  await ctx.app.evaluate(({ BrowserWindow, dialog }, input) => {
    BrowserWindow.getAllWindows()[0].setSize(800, 600)
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] })
  }, fixture)
  await ctx.page.getByTestId('sidebar-nav-settings').click()
  await ctx.page.getByTestId('settings-lang-select').selectOption(language)
  // No results yet, so the sidebar opens the formula-check entry page.
  await ctx.page.getByTestId('sidebar-nav-audit').click()
}

// Controlled IPC validates real renderer behavior; these are not model-quality tests.
for (const language of ['en', 'zh'] as const) {
  test(`bounded review shows full denominators and partial success (${language}, 800x600)`, async () => {
    const ctx = await launchApp()
    try {
      await prepare(ctx, language)
      await ctx.app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('analyze:all')
        ipcMain.handle('analyze:all', (event, _file, scanId) => new Promise(resolve => {
          const initial = { total: 80, selected: 20, attempted: 2, reviewed: 1, failed: 1, skipped: 78 }
          event.sender.send('sidecar:scan-progress', { scanId, phase: 'ai', percent: 10, message: '', auditReview: initial })
          ;(globalThis as any).__FINISH_REVIEW_TEST__ = () => {
            const issues = Array.from({ length: 80 }, (_, index) => ({
              ruleId: 'CONTROLLED_UI_TEST', cell: `A${index + 1}`, sheet: 'Invoice Audit', severity: 'warning',
              confidence: 0.7, formula: '=1', message: 'Controlled UI fixture',
              ...(index < 18 ? { llmVerified: true } : {}),
            }))
            event.sender.send('analyze:engine-done', { scanId, engine: 'pii', result: { success: true, findings: [] } })
            event.sender.send('analyze:engine-done', { scanId, engine: 'audit', result: {
              issues, auditReview: { total: 80, selected: 20, attempted: 20, reviewed: 18, failed: 2, skipped: 60, stopReason: 'candidate-limit' },
            } })
            resolve({ success: true })
          }
        }))
      })
      await ctx.page.getByTestId('dropzone-browse-btn').click()
      await expect(ctx.page.getByTestId('audit-review-progress')).toContainText(language === 'en' ? 'Processed 2 of 20' : '已处理 2/20')
      await expect(ctx.page.getByTestId('audit-review-progress')).toContainText(language === 'en' ? '20 of 80' : '20/80')
      await expect(ctx.page.getByTestId('scan-cancel')).toBeVisible()
      await ctx.page.screenshot({ animations: 'disabled', path: join(evidence, `progress-${language}-800x600.png`) })
      await ctx.app.evaluate(() => (globalThis as any).__FINISH_REVIEW_TEST__())
      await expect(ctx.page).toHaveURL(/#\/results$/)
      const notice = ctx.page.getByTestId('audit-review-summary')
      await expect(notice).toContainText('18/80'.replace('/', language === 'en' ? ' of ' : '/'))
      await expect(notice).toContainText(language === 'en' ? '62 other issues have no result.' : '另外 62 条没有复核结论。')
      await expect(notice).toContainText(language === 'en' ? "It couldn't reach a conclusion on 2 issues." : '有 2 条它没能得出结论。')
      await expect(ctx.page.locator('[data-testid^="results-issue-card-"]')).toHaveCount(80)
      await ctx.page.screenshot({ animations: 'disabled', path: join(evidence, `partial-${language}-800x600.png`) })
    } finally { await teardownApp(ctx) }
  })
}

test('a failed stop retains the scan identity and the visible retry action', async () => {
  const ctx = await launchApp()
  try {
    await prepare(ctx, 'en')
    await ctx.app.evaluate(({ ipcMain }) => {
      let scanIdentity = ''
      let stops = 0
      ipcMain.removeHandler('analyze:all')
      ipcMain.handle('analyze:all', (_event, _file, scanId) => {
        scanIdentity = scanId
        return { success: false, errorCode: 'model-stop-failed', error: 'Controlled stop failure' }
      })
      ipcMain.removeHandler('analyze:cancel')
      ipcMain.handle('analyze:cancel', (_event, scanId) => {
        if (scanId !== scanIdentity) throw new Error('Stop retry lost its original scan identity')
        stops += 1
        if (stops === 1) throw new Error('Controlled stop still failing')
        return { success: true }
      })
    })
    await ctx.page.getByTestId('dropzone-browse-btn').click()
    const retry = ctx.page.getByTestId('scan-cancel')
    await expect(retry).toHaveText('Retry stopping AI')
    await expect(ctx.page).toHaveURL(/#\/scanning$/)
    await ctx.page.screenshot({ animations: 'disabled', path: join(evidence, 'stop-retry-800x600.png') })
    await retry.click()
    await expect(retry).toHaveText('Retry stopping AI')
    await expect(ctx.page).toHaveURL(/#\/scanning$/)
    await retry.click()
    await expect(ctx.page.getByTestId('home-page')).toBeVisible()
  } finally { await teardownApp(ctx) }
})
