import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'fs'
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
    await page.locator('[data-testid="export-btn"]').click()
    await page.locator('[data-testid="export-html"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toContainText(output)
    expect(readFileSync(output, 'utf8')).toContain('CellSentry Report')
  })

  test('exports a real PDF and marked workbook through visible menu items', async () => {
    const pdfOutput = join(EXPORT_DIR, 'audit.pdf')
    await stubSaveDialog({ canceled: false, filePath: pdfOutput })
    await page.locator('[data-testid="export-btn"]').click()
    await page.locator('[data-testid="export-pdf"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toContainText(pdfOutput)
    expect(readFileSync(pdfOutput).subarray(0, 4).toString()).toBe('%PDF')

    const xlsxOutput = join(EXPORT_DIR, 'audit.xlsx')
    await stubSaveDialog({ canceled: false, filePath: xlsxOutput })
    await page.locator('[data-testid="export-btn"]').click()
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
    await page.locator('[data-testid="export-btn"]').click()
    await page.locator('[data-testid="export-html"]').click()
    await expect(page.locator('.export-feedback[role="status"]')).toHaveCount(0)

    await stubSaveDialog({ canceled: false, filePath: EXPORT_DIR })
    await page.locator('[data-testid="export-btn"]').click()
    await page.locator('[data-testid="export-html"]').click()
    await expect(page.locator('.export-feedback.error')).toBeVisible()
    await expect(page.locator('.export-feedback.error')).toContainText(/EISDIR|EPERM|EACCES/)
  })

  test('redacts the real workbook from the PII button', async () => {
    const output = join(EXPORT_DIR, 'redacted.xlsx')
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await expect(page.locator('[data-testid="pii-redact-btn"]')).toBeVisible()
    await stubSaveDialog({ canceled: false, filePath: output })
    await page.locator('[data-testid="pii-redact-btn"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('pii-confirm-redact-btn').click()
    await expect(page.locator('.pii-export-feedback.success')).toContainText(output)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(output)
    expect(String(workbook.getWorksheet('Contacts')?.getCell('B2').value)).not.toContain('alice.johnson@example.com')
  })

  test('exports extraction JSON and CSV through their visible buttons', async () => {
    await page.locator('[data-testid="sidebar-nav-extraction"]').click()
    await expect(page.locator('[data-testid="extraction-results-panel-left"]')).toBeVisible()

    const jsonOutput = join(EXPORT_DIR, 'extraction.json')
    await stubSaveDialog({ canceled: false, filePath: jsonOutput })
    await page.locator('[data-testid="extraction-export-json-btn"]').click()
    await expect(page.locator('.ext-export-feedback.success')).toContainText(jsonOutput)
    expect(JSON.parse(readFileSync(jsonOutput, 'utf8'))).toHaveProperty('tables')

    const csvOutput = join(EXPORT_DIR, 'extraction.csv')
    await stubSaveDialog({ canceled: false, filePath: csvOutput })
    await page.locator('[data-testid="extraction-export-csv-btn"]').click()
    await expect(page.locator('.ext-export-feedback.success')).toContainText(csvOutput)
    expect(readFileSync(csvOutput, 'utf8')).toContain('Field,Value,Cell,Sheet,Confidence')
    expect(existsSync(csvOutput)).toBe(true)
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
    await expect(page.locator('.file-name')).toContainText('combined-test-data.xlsx')
    await page.getByTestId('results-batch-tab-0').click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('[data-testid^="results-issue-card-"]')).toHaveCount(0)
    await expect(page.locator('.file-name')).toContainText('broken.xlsx')
    await page.getByTestId('results-batch-tab-1').click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('[data-testid^="results-issue-card-"]')).not.toHaveCount(0)
  })

})
