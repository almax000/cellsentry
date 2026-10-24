import { test, expect } from '@playwright/test'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

const WORKBOOK = join(__dirname, 'fixtures', 'combined-test-data.xlsx')

test.describe('audit sidebar and drop routing', () => {
  let ctx: TestContext

  test.beforeEach(async () => {
    ctx = await launchApp()
  })

  test.afterEach(async () => {
    await teardownApp(ctx)
  })

  test('keeps one audit entry available before and after a workbook scan', async () => {
    const { page } = ctx
    await expect(page.getByTestId('sidebar-nav-audit')).toBeVisible()
    await expect(page.getByTestId('sidebar-nav-pii')).toHaveCount(0)
    await expect(page.getByTestId('sidebar-nav-extraction')).toHaveCount(0)

    await page.getByTestId('sidebar-nav-audit').click()
    await expect(page).toHaveURL(/#\/audit$/)
    await page.evaluate((filePath) => window.__TEST_API__?.triggerFileAnalysis(filePath), WORKBOOK)
    await expect(page).toHaveURL(/#\/results$/, { timeout: 30_000 })
    await expect(page.getByTestId('sidebar-nav-audit')).toHaveClass(/active/)
    await expect(page.getByTestId('results-panel-left')).toBeVisible()
  })

  test('treats PDF drops as unsupported instead of routing into a document flow', async () => {
    const { page } = ctx
    await page.evaluate(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['%PDF-'], 'invoice.pdf', { type: 'application/pdf' }))
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }))
    })
    await expect(page.getByTestId('drop-overlay')).toHaveAttribute('data-kind', 'unsupported')
    await page.evaluate(() => window.dispatchEvent(new DragEvent('drop', { bubbles: true })))
    await expect(page).not.toHaveURL(/#\/(pii|redact|extract)/)
  })

  test('rejects a mixed workbook and PDF drop as one batch', async () => {
    const { page } = ctx
    await page.evaluate((filePath) => {
      window.dispatchEvent(new CustomEvent('cellsentry:test-drop', {
        detail: { files: [
          { path: filePath, name: 'ledger.xlsx', size: 1 },
          { path: '/tmp/invoice.pdf', name: 'invoice.pdf', size: 1 },
        ] },
      }))
    }, WORKBOOK)
    const notice = page.getByTestId('drop-notice')
    await expect(notice).toHaveAttribute('data-kind', 'unsupported')
    await expect(notice).toContainText('Remove unsupported files and try again')
    await expect(page).not.toHaveURL(/#\/(scanning|results)/)
  })
})
