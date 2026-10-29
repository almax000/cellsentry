import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

const COMBINED_FIXTURE = join(__dirname, 'fixtures', 'combined-test-data.xlsx')
const EXPORT_DIR = join(__dirname, '..', 'tmp', 'e2e', 'exports')

let ctx: TestContext
let page: TestContext['page']

async function stubSaveDialog(result: { canceled: boolean; filePath?: string }): Promise<void> {
  await ctx.app.evaluate(({ dialog }, response) => {
    dialog.showSaveDialog = async () => response
  }, result)
}

async function openExport(): Promise<void> {
  if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape')
  await page.getByTestId('export-btn').click()
}

async function scanFixture(): Promise<void> {
  await page.evaluate((filePath) => window.__TEST_API__?.triggerFileAnalysis(filePath), COMBINED_FIXTURE)
  await page.waitForFunction(() => window.location.hash === '#/results', { timeout: 30000 })
}

test.describe.serial('real export round trips', () => {
  test.beforeAll(async () => {
    mkdirSync(EXPORT_DIR, { recursive: true })
    ctx = await launchApp()
    page = ctx.page
    await scanFixture()
  })

  test.afterAll(async () => {
    if (ctx) await teardownApp(ctx)
  })

  test('starts without downloading a model', async () => {
    const status = await page.evaluate(() => window.api.getModelStatus())
    expect(status.exists).toBe(false)
  })

  test('exports audit HTML through the visible menu', async () => {
    const output = join(EXPORT_DIR, 'audit.html')
    await stubSaveDialog({ canceled: false, filePath: output })
    await openExport()
    await page.locator('[data-testid="export-html"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toContainText(output)
    expect(readFileSync(output, 'utf8')).toContain('CellSentry spreadsheet review')
  })

  test('exports a real PDF and marked workbook through visible menu items', async () => {
    const pdfOutput = join(EXPORT_DIR, 'audit.pdf')
    await stubSaveDialog({ canceled: false, filePath: pdfOutput })
    await openExport()
    await page.locator('[data-testid="export-pdf"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toContainText(pdfOutput)
    expect(readFileSync(pdfOutput).subarray(0, 4).toString()).toBe('%PDF')

    const xlsxOutput = join(EXPORT_DIR, 'audit.xlsx')
    await stubSaveDialog({ canceled: false, filePath: xlsxOutput })
    await openExport()
    await page.locator('[data-testid="export-xlsx"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toContainText(xlsxOutput)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(xlsxOutput)
    const notes = workbook.worksheets.flatMap((sheet) => {
      const values: string[] = []
      sheet.eachRow((row) => row.eachCell((cell) => {
        if (typeof cell.note === 'string') values.push(cell.note)
      }))
      return values
    })
    expect(notes.some((note) => note.startsWith('[CellSentry]'))).toBe(true)
  })

  test('surfaces cancellation and write failures without pretending export succeeded', async () => {
    await stubSaveDialog({ canceled: true })
    await openExport()
    await page.locator('[data-testid="export-html"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toContainText('Export cancelled')

    await stubSaveDialog({ canceled: false, filePath: EXPORT_DIR })
    await openExport()
    await page.locator('[data-testid="export-html"]').click()
    await expect(page.locator('.export-feedback.error')).toBeVisible()
    await expect(page.locator('.export-feedback.error')).toContainText(/EISDIR|EPERM|EACCES/)
  })

  test('offers no PII protection flow in audit results', async () => {
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results-protection-tab')).toHaveCount(0)
    await expect(page.getByTestId('pii-redact-btn')).toHaveCount(0)
    await expect(page.getByTestId('audit-workspace')).toBeVisible()
  })

  test('keeps batch source identity and displays failed files without stale results', async () => {
    const broken = join(EXPORT_DIR, 'broken.xlsx')
    writeFileSync(broken, 'This is deliberately not an XLSX archive')
    await ctx.app.evaluate(({ dialog }, filePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths })
    }, [broken, COMBINED_FIXTURE])
    await page.getByTestId('sidebar-nav-home').click()
    await page.getByTestId('home-task-audit').click()
    await page.getByTestId('dropzone-batch-btn').click()
    await expect(page.getByTestId('results-batch-tab-1')).toHaveClass(/active/)
    await expect(page.locator('.aw-filetitle h2')).toContainText('combined-test-data.xlsx')
    await page.getByTestId('results-batch-tab-0').click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('[data-testid^="results-issue-card-"]')).toHaveCount(0)
    await expect(page.locator('.aw-filetitle h2')).toContainText('broken.xlsx')
    await page.getByTestId('results-batch-tab-1').click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('[data-testid^="results-issue-card-"]')).not.toHaveCount(0)
  })

})
