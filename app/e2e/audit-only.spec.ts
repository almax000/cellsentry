import { test, expect } from '@playwright/test'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

const WORKBOOK = join(__dirname, 'fixtures', 'combined-test-data.xlsx')

test('audits a workbook through the single product flow', async ({}, testInfo) => {
  const ctx: TestContext = await launchApp()
  try {
    const { page } = ctx

    await expect(page.getByTestId('home-page')).toBeVisible()
    await expect(page.getByTestId('home-task-audit')).toBeVisible()
    await expect(page.getByTestId('home-task-pii')).toHaveCount(0)
    await expect(page.getByTestId('home-task-extraction')).toHaveCount(0)
    await expect(page.getByTestId('sidebar-nav-audit')).toBeVisible()
    await expect(page.getByTestId('sidebar-nav-pii')).toHaveCount(0)
    await expect(page.getByTestId('sidebar-nav-extraction')).toHaveCount(0)
    expect(await page.evaluate(() => ['redact', 'analyzePii', 'analyzeExtraction', 'exportExtraction']
      .filter((key) => key in window.api))).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('audit-home.png'), animations: 'disabled' })

    await page.evaluate(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['%PDF-'], 'invoice.pdf', { type: 'application/pdf' }))
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }))
    })
    const unsupportedOverlay = page.getByTestId('drop-overlay')
    await expect(unsupportedOverlay).toHaveAttribute('data-kind', 'unsupported')
    await expect(unsupportedOverlay).toContainText('Remove unsupported files')
    await expect(unsupportedOverlay).not.toContainText(/PDF|extract/i)
    await page.evaluate(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['%PDF-'], 'invoice.pdf', { type: 'application/pdf' }))
      window.dispatchEvent(new DragEvent('dragleave', { dataTransfer: transfer, bubbles: true }))
    })
    await expect(page.getByTestId('drop-overlay')).toHaveCount(0)

    await page.getByTestId('home-task-audit').click()
    await expect(page).toHaveURL(/#\/audit$/)
    await expect(page.getByTestId('entry-audit')).toBeVisible()

    await ctx.app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, WORKBOOK)
    await page.getByTestId('dropzone-browse-btn').click()
    await page.waitForURL(/#\/results$/, { timeout: 15000 })
    await expect(page.getByTestId('results-panel-left')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('audit-results.png'), animations: 'disabled' })
  } finally {
    await teardownApp(ctx)
  }
})
