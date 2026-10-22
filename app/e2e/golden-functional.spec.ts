import { test, expect } from '@playwright/test'
import { createHash } from 'crypto'
import { existsSync, readFileSync, mkdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import { cellLabel } from '../src/utils/cellLabel'

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The plain-language location the card shows, in whichever language the app is using. */
const visibleCellLabel = (cell: string): RegExp =>
  new RegExp(`${escapeRegExp(cellLabel(cell, 'zh'))}|${escapeRegExp(cellLabel(cell, 'en'))}`)

type Manifest = {
  sourceSha256: string
  rulesOnly: boolean
  modelAccuracyVerified: boolean
  audit: { requiredIssues: Array<{ sheet: string; cell: string; ruleId: string; severity: string }> }
  pii: { expectedFindings: Array<{ sheet: string; cell: string; type: string; masked: string }> }
  extraction: {
    documentType: string
    fields: Array<{ key: string; value: string; cell: string; sheet: string }>
    table: { sheet: string; headerRow: number; startCell: string; endCell: string; headers: string[]; rows: string[][] }
    csvRows: string[]
  }
}

const FIXTURE = join(__dirname, 'fixtures', 'golden-three-workflows.xlsx')
const manifest = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'golden-three-workflows.manifest.json'), 'utf8')) as Manifest
const GOLDEN_TMP_ROOT = join(__dirname, '..', 'tmp', 'e2e', 'golden')

let ctx: TestContext
let page: TestContext['page']
let exportDir: string

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

async function setSavePath(filePath: string): Promise<void> {
  await ctx.app.evaluate(({ dialog }, output) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
  }, filePath)
}

async function scanGolden(): Promise<void> {
  await page.evaluate((filePath) => window.__TEST_API__?.triggerFileAnalysis(filePath), FIXTURE)
  await expect(page).toHaveURL(/#\/results$/, { timeout: 30_000 })
}

test.describe.serial('golden workbook: deterministic audit, PII redaction, and extraction', () => {
  test.beforeAll(async () => {
    expect(manifest.rulesOnly).toBe(true)
    expect(manifest.modelAccuracyVerified).toBe(false)
    expect(sha256(FIXTURE)).toBe(manifest.sourceSha256)
    mkdirSync(GOLDEN_TMP_ROOT, { recursive: true })
    exportDir = mkdtempSync(join(GOLDEN_TMP_ROOT, 'golden-run-'))
    ctx = await launchApp()
    page = ctx.page
    await scanGolden()
  })

  test.afterAll(async () => {
    if (ctx) await teardownApp(ctx)
  })

  test('shows the required deterministic audit findings and exports readable marked evidence', async () => {
    const cards = page.locator('[data-testid^="results-issue-card-"]')
    await expect(cards).not.toHaveCount(0)
    for (const expected of manifest.audit.requiredIssues) {
      // Rule IDs and raw addresses are no longer visible card text; match the card's data attributes.
      const card = page.locator(`[data-testid^="results-issue-card-"][data-rule-id="${expected.ruleId}"][data-sheet-name="${expected.sheet}"][data-cell-address="${expected.cell}"]`)
      await expect(card).toHaveCount(1)
      await expect(card).toContainText(visibleCellLabel(expected.cell))
    }
    await page.screenshot({ path: join(exportDir, 'audit-clean.png'), animations: 'disabled' })

    const markedOutput = join(exportDir, 'audit-marked.xlsx')
    await setSavePath(markedOutput)
    await page.getByTestId('export-btn').click()
    await page.getByTestId('export-xlsx').click()
    await expect(page.locator('.export-feedback.success')).toContainText(markedOutput)
    expect(sha256(FIXTURE)).toBe(manifest.sourceSha256)

    const marked = new ExcelJS.Workbook()
    await marked.xlsx.readFile(markedOutput)
    for (const expected of manifest.audit.requiredIssues) {
      const note = marked.getWorksheet(expected.sheet)?.getCell(expected.cell).note
      // A cell can carry several rule findings; Excel marker currently stores one
      // note per cell, so UI is the source of rule identity and the workbook proves
      // the source location remained annotated and readable.
      expect(String(note)).toContain('[CellSentry]')
    }
    await page.screenshot({ path: join(exportDir, 'audit.png'), animations: 'disabled' })
  })

  test('shows exact regex PII findings and writes a separately readable redacted workbook', async () => {
    await page.getByTestId('sidebar-nav-pii').click()
    await expect(page.getByTestId('pii-results-panel-left')).toBeVisible()
    await expect(page.getByTestId('header-export-btn')).toHaveCount(0)
    await expect(page.locator('.export-feedback')).toHaveCount(0)
    const cards = page.locator('[data-testid^="pii-finding-card-"]')
    await expect(cards).toHaveCount(manifest.pii.expectedFindings.length)
    for (const expected of manifest.pii.expectedFindings) {
      const card = cards.and(page.locator(`[data-sheet-name="${expected.sheet}"][data-cell-address="${expected.cell}"]`)).filter({ hasText: expected.masked })
      await expect(card).toHaveCount(1)
    }
    await page.screenshot({ path: join(exportDir, 'pii-clean.png'), animations: 'disabled' })

    const redactedOutput = join(exportDir, 'pii-redacted.xlsx')
    const redactButton = page.getByTestId('pii-redact-btn')
    const redactBounds = await redactButton.boundingBox()
    expect(redactBounds).not.toBeNull()
    expect(redactBounds!.y + redactBounds!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight))
    await setSavePath(redactedOutput)
    await redactButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('pii-confirm-redact-btn').click()
    await expect(page.locator('.pii-export-feedback.success')).toContainText(redactedOutput)
    expect(sha256(FIXTURE)).toBe(manifest.sourceSha256)

    const redacted = new ExcelJS.Workbook()
    await redacted.xlsx.readFile(redactedOutput)
    for (const expected of manifest.pii.expectedFindings) {
      expect(String(redacted.getWorksheet(expected.sheet)?.getCell(expected.cell).value)).toBe(expected.masked)
    }
    expect(redacted.worksheets.map((sheet) => sheet.name)).toEqual(['Invoice Audit', 'PII Review'])
    const invoice = redacted.getWorksheet('Invoice Audit')
    expect(invoice?.getCell('A1').value).toBe('Sales Invoice')
    expect(invoice?.getCell('B3').value).toBe('INV-GOLD-001')
    expect(invoice?.getCell('G3').formula).toBe('G3+1')
    expect(invoice?.getCell('E9').formula).toBe('C9*D9')
    expect(invoice?.getCell('E11').formula).toBe('C11+D11')
    await page.screenshot({ path: join(exportDir, 'pii.png'), animations: 'disabled' })
  })

  test('extracts manifest fields and tables, then round-trips JSON and safe CSV', async () => {
    await page.getByTestId('sidebar-nav-extraction').click()
    await expect(page.getByTestId('extraction-results-panel-left')).toBeVisible()
    await expect(page.getByTestId('header-export-btn')).toHaveCount(0)
    await expect(page.locator('.export-feedback')).toHaveCount(0)
    await expect(page.getByTestId('extraction-doc-type')).toContainText(new RegExp(manifest.extraction.documentType, 'i'))
    const cards = page.locator('[data-testid^="extraction-field-card-"]')
    for (const expected of manifest.extraction.fields) {
      const card = cards.and(page.locator(`[data-sheet-name="${expected.sheet}"][data-cell-address="${expected.cell}"]`)).filter({ hasText: expected.value })
      await expect(card).toHaveCount(1)
    }
    const table = page.locator('[data-testid="extraction-table-card-0"]')
    await expect(table).toContainText(`${manifest.extraction.table.startCell}:${manifest.extraction.table.endCell}`)
    await expect(table).toContainText(`${manifest.extraction.table.rows.length} rows`)
    await page.screenshot({ path: join(exportDir, 'extraction-clean.png'), animations: 'disabled' })

    const jsonOutput = join(exportDir, 'extraction.json')
    await setSavePath(jsonOutput)
    await page.getByTestId('extraction-export-json-btn').click()
    await expect(page.locator('.ext-export-feedback.success')).toContainText(jsonOutput)
    const exportedJson = JSON.parse(readFileSync(jsonOutput, 'utf8')) as { fields: Array<{ key: string; value: string; cell: string; sheet_name: string }>; tables: Array<{ sheet_name: string; header_row: number; headers: string[]; start_cell: string; end_cell: string; rows: string[][] }> }
    for (const expected of manifest.extraction.fields) {
      expect(exportedJson.fields).toContainEqual(expect.objectContaining({ key: expected.key, value: expected.value, cell: expected.cell, sheet_name: expected.sheet }))
    }
    expect(exportedJson.tables).toContainEqual(expect.objectContaining({
      sheet_name: manifest.extraction.table.sheet,
      header_row: manifest.extraction.table.headerRow,
      headers: manifest.extraction.table.headers,
      rows: manifest.extraction.table.rows,
      start_cell: manifest.extraction.table.startCell,
      end_cell: manifest.extraction.table.endCell,
    }))

    const csvOutput = join(exportDir, 'extraction.csv')
    await setSavePath(csvOutput)
    await page.getByTestId('extraction-export-csv-btn').click()
    await expect(page.locator('.ext-export-feedback.success')).toContainText(csvOutput)
    const csv = readFileSync(csvOutput, 'utf8')
    for (const expectedRow of manifest.extraction.csvRows) expect(csv).toContain(expectedRow)
    expect(existsSync(csvOutput)).toBe(true)
    expect(sha256(FIXTURE)).toBe(manifest.sourceSha256)
    await page.screenshot({ path: join(exportDir, 'extraction.png'), animations: 'disabled' })
  })
})
