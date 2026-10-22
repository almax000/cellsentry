import { test, expect } from '@playwright/test'
import { createHash } from 'crypto'
import { mkdtempSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

test('source review follows sheet and distant cells; selection controls the actual redacted copy', async () => {
  const root = join(__dirname, '..', 'tmp', 'e2e', 'review')
  mkdirSync(root, { recursive: true })
  const output = mkdtempSync(join(root, 'run-'))
  const source = join(output, 'source-review.xlsx')
  const workbook = new ExcelJS.Workbook()
  const first = workbook.addWorksheet('First sheet')
  first.getCell('B2').value = 'first@example.test'
  const second = workbook.addWorksheet('Second sheet')
  second.getCell('B2').value = 'second@example.test'
  second.getCell('AA80').value = 'distant@example.test'
  await workbook.xlsx.writeFile(source)
  const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
  let ctx: TestContext | undefined
  try {
    ctx = await launchApp()
    const { app, page } = ctx
    await page.evaluate((file) => window.__TEST_API__?.triggerFileAnalysis(file), source)
    await expect(page).toHaveURL(/#\/results$/, { timeout: 30_000 })
    await page.getByTestId('sidebar-nav-pii').click()
    const cards = page.locator('[data-testid^="pii-finding-card-"]')
    await expect(cards).toHaveCount(3)
    await cards.and(page.locator('[data-sheet-name="Second sheet"][data-cell-address="B2"]')).locator('.pii-finding-body').click()
    await expect(page.locator('.sheet-tab.active')).toHaveText('Second sheet')
    await expect(page.locator('[data-cell="B2"]')).toHaveText('second@example.test')
    await cards.and(page.locator('[data-sheet-name="Second sheet"][data-cell-address="AA80"]')).locator('.pii-finding-body').click()
    await expect(page.getByTestId('preview-range')).toHaveText('S68:AR117')
    await expect(page.locator('[data-cell="AA80"]')).toHaveText('distant@example.test')
    await expect(page.locator('[data-cell="AA80"]')).toHaveClass(/selected-cell/)
    await page.getByRole('button', { name: 'First sheet', exact: true }).click()
    await expect(page.locator('[data-cell="B2"]')).toHaveText('first@example.test')
    // Re-selecting the same finding must return from a manually changed sheet.
    await cards.and(page.locator('[data-sheet-name="Second sheet"][data-cell-address="AA80"]')).locator('.pii-finding-body').click()
    await expect(page.locator('.sheet-tab.active')).toHaveText('Second sheet')
    await expect(page.locator('[data-cell="AA80"]')).toHaveText('distant@example.test')

    await page.getByTestId('pii-select-all-btn').click()
    await expect(page.getByTestId('pii-redact-btn')).toBeDisabled()
    await cards.and(page.locator('[data-sheet-name="Second sheet"][data-cell-address="AA80"]')).getByRole('checkbox').check()
    await expect(page.getByTestId('pii-selection-count')).toHaveText('1 / 3 selected')
    await page.getByTestId('pii-redact-btn').click()
    await expect(page.getByRole('dialog')).toContainText('distant@example.test')
    await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(1)
    await page.screenshot({ path: join(output, 'review-confirmation.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('pii-redact-btn')).toBeFocused()

    const target = join(output, 'selected-only.xlsx')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await page.getByTestId('pii-redact-btn').click()
    await page.getByTestId('pii-confirm-redact-btn').click()
    await expect(page.locator('.pii-export-feedback.success')).toContainText(target)
    const redacted = new ExcelJS.Workbook()
    await redacted.xlsx.readFile(target)
    expect(redacted.getWorksheet('First sheet')!.getCell('B2').value).toBe('first@example.test')
    expect(redacted.getWorksheet('Second sheet')!.getCell('B2').value).toBe('second@example.test')
    expect(redacted.getWorksheet('Second sheet')!.getCell('AA80').value).toBe('d***@example.test')
    expect(createHash('sha256').update(readFileSync(source)).digest('hex')).toBe(sourceHash)
  } finally {
    if (ctx) await teardownApp(ctx)
  }
})

test('batch preview resets to a worksheet belonging to the selected source file', async () => {
  const root = join(__dirname, '..', 'tmp', 'e2e', 'review')
  mkdirSync(root, { recursive: true })
  const output = mkdtempSync(join(root, 'batch-'))
  const files: string[] = []
  for (const name of ['Revenue', 'Costs']) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(name)
    sheet.getCell('A1').value = `${name} source`
    sheet.getCell('B2').value = { formula: 'B2+1', result: 1 }
    const file = join(output, `${name}.xlsx`)
    await workbook.xlsx.writeFile(file)
    files.push(file)
  }
  const ctx = await launchApp()
  try {
    await ctx.app.evaluate(({ dialog }, filePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths })
    }, files)
    await ctx.page.getByTestId('sidebar-nav-audit').click()
    await ctx.page.getByTestId('dropzone-batch-btn').click()
    await expect(ctx.page.getByTestId('results-batch-tab-0')).toHaveClass(/active/)
    await ctx.page.getByTestId('results-batch-tab-0').click()
    await expect(ctx.page.locator('.sheet-tab.active')).toHaveText('Revenue')
    await expect(ctx.page.locator('[data-cell="A1"]')).toHaveText('Revenue source')
    await ctx.page.getByTestId('results-batch-tab-1').click()
    await expect(ctx.page.locator('.sheet-tab.active')).toHaveText('Costs')
    await expect(ctx.page.locator('[data-cell="A1"]')).toHaveText('Costs source')
    await expect(ctx.page.getByRole('alert')).toHaveCount(0)
    await ctx.page.getByTestId('results-batch-tab-0').click()
    await expect(ctx.page.locator('.sheet-tab.active')).toHaveText('Revenue')
    await expect(ctx.page.locator('[data-cell="A1"]')).toHaveText('Revenue source')
  } finally {
    await teardownApp(ctx)
  }
})

test('language selection synchronizes rule-engine messages before each real rescan', async () => {
  const root = join(__dirname, '..', 'tmp', 'e2e', 'review')
  mkdirSync(root, { recursive: true })
  const output = mkdtempSync(join(root, 'locale-'))
  const source = join(output, 'localized-rule.xlsx')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Rules')
  sheet.getCell('A1').value = { formula: 'A1', result: 0 }
  await workbook.xlsx.writeFile(source)

  let ctx: TestContext | undefined
  try {
    ctx = await launchApp()
    const { app, page } = ctx
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, source)

    const browseAndScan = async (): Promise<void> => {
      await page.getByTestId('sidebar-nav-home').click()
      await expect(page).toHaveURL(/#\/$/)
      await page.getByTestId('home-task-audit').click()
      await expect(page).toHaveURL(/#\/audit$/)
      await page.getByTestId('dropzone-browse-btn').click()
      await expect(page).toHaveURL(/#\/results$/, { timeout: 30_000 })
    }

    await page.getByTestId('sidebar-nav-settings').click()
    const language = page.getByTestId('settings-lang-select')
    await language.selectOption('zh')
    await expect(language).toHaveValue('zh')
    await browseAndScan()
    await expect(page.getByTestId('results-issue-card-0')).toContainText('循环引用')

    await page.getByTestId('sidebar-nav-settings').click()
    await language.selectOption('en')
    await expect(language).toHaveValue('en')
    await browseAndScan()
    await expect(page.getByTestId('results-issue-card-0')).toContainText('Circular reference')
  } finally {
    if (ctx) await teardownApp(ctx)
  }
})
