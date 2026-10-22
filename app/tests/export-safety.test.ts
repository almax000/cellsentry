import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import type { PiiFinding } from '../electron/pii/types'

const { saveDialog } = vi.hoisted(() => ({ saveDialog: vi.fn() }))
vi.mock('../electron/llm/lifecycle', () => ({ isLocalAiReadyFor: () => true, analyzeWithLlmPii: vi.fn(async () => []) }))
vi.mock('electron', () => ({ app: { getVersion: () => 'test' }, dialog: { showSaveDialog: saveDialog }, BrowserWindow: vi.fn() }))
import { exportAudit, exportExtraction, redactPii } from '../electron/main/exportHandlers'
import { redactFile, redactSelectedCell } from '../electron/pii/redactor'
import { maskPiiText } from '../electron/pii/masking'
import { exportToCsv } from '../electron/extraction/exporters'
import { scanForPiiFromSheets } from '../electron/pii/scanner'
import { readWorkbook } from '../electron/engine/excelReader'

let directory: string
let sequence = 0
const nextPath = (name: string): string => join(directory, `${sequence++}-${name}`)
beforeAll(async () => {
  const base = resolve(__dirname, '../../tmp/tests')
  await mkdir(base, { recursive: true })
  directory = await mkdtemp(join(base, 'export-safety-'))
})
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
beforeEach(() => { saveDialog.mockReset() })
const finding = (cell: string, original: string, type = 'email', pattern = 'Email address'): PiiFinding => ({
  sheet_name: 'S', cell, pii_type: type, original_value: original, masked_value: maskPiiText(original, type), confidence: 1, pattern,
})
async function workbook(values: ExcelJS.CellValue[]): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('S')
  values.forEach((value, index) => { ws.getCell(`A${index + 1}`).value = value })
  const source = nextPath('source.xlsx')
  await wb.xlsx.writeFile(source)
  return source
}
async function values(path: string): Promise<ExcelJS.CellValue[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  return wb.getWorksheet('S')!.getColumn(1).values.slice(1) as ExcelJS.CellValue[]
}

describe('source protection across export formats', () => {
  for (const alias of ['same', 'symlink', 'hardlink'] as const) {
    for (const format of ['html', 'pdf', 'xlsx', 'csv', 'json', 'pii'] as const) {
      it(`rejects ${format} output through ${alias} before writing`, async () => {
        const source = await workbook(['jane@example.com'])
        const original = await readFile(source)
        const output = alias === 'same' ? source : nextPath('alias.xlsx')
        if (alias === 'symlink') await symlink(source, output)
        if (alias === 'hardlink') await link(source, output)
        saveDialog.mockResolvedValue({ filePath: output, canceled: false })
        const base = { filePath: source, fileName: 'source.xlsx' }
        const result = format === 'pii'
          ? await redactPii({ ...base, findings: [] })
          : format === 'csv' || format === 'json'
            ? await exportExtraction({ ...base, format, fields: [], tables: [] })
            : await exportAudit({ ...base, format, issues: [] })
        expect(result).toMatchObject({ success: false, error: 'Refusing to overwrite the source file' })
        expect(await readFile(source)).toEqual(original)
      })
    }
  }
  it('reports dialog cancellation and rejection consistently', async () => {
    const actions = [
      () => exportAudit({ filePath: 'unused', fileName: 'source', format: 'html', issues: [] }),
      () => exportExtraction({ filePath: 'unused', fileName: 'source', format: 'csv', fields: [], tables: [] }),
      () => redactPii({ filePath: 'unused.xlsx', fileName: 'source', findings: [] }),
    ]
    for (const action of actions) {
      saveDialog.mockResolvedValueOnce({ canceled: true })
      expect(await action()).toEqual({ success: false, cancelled: true })
      saveDialog.mockRejectedValueOnce(new Error('dialog unavailable'))
      expect(await action()).toEqual({ success: false, error: 'dialog unavailable' })
    }
  })
})

describe('PII redaction correctness', () => {
  it('covers locale variants, all occurrences, and preserves unselected cells', async () => {
    const originals = ['+1 415-555-2671', '123456789', 'first@example.com second@example.com', 'keep@example.com']
    const source = await workbook(originals)
    const output = nextPath('masked.xlsx')
    const selected = [finding('A1', originals[0], 'phone', 'US phone number'), finding('A2', originals[1], 'ssn', 'US SSN (9 digits)'), finding('A3', originals[2])]
    expect(await redactFile(source, output, selected)).toMatchObject({ success: true, redactedCount: 3 })
    expect(await values(output)).toEqual(['141****2671', '*****6789', 'f***@example.com s***@example.com', originals[3]])
  })
  it('reads rich text, cached formula and hyperlink text then removes original object payloads', async () => {
    const original = 'jane@example.com'
    const source = await workbook([
      { richText: [{ text: 'jane@' }, { text: 'example.com' }] },
      { formula: '"jane@example.com"', result: original },
      { text: original, hyperlink: 'mailto:jane@example.com' },
    ])
    const output = nextPath('objects.xlsx')
    expect(await redactFile(source, output, ['A1', 'A2', 'A3'].map((cell) => finding(cell, original)))).toMatchObject({ success: true, redactedCount: 3 })
    expect(await values(output)).toEqual(Array(3).fill('j***@example.com'))
  })
  it('treats an explicit empty selection as no changes', async () => {
    const source = await workbook(['jane@example.com'])
    const output = nextPath('empty.xlsx')
    expect(await redactFile(source, output, [])).toMatchObject({ success: true, redactedCount: 0 })
    expect(await values(output)).toEqual(['jane@example.com'])
  })
  it('fails before replacing an existing output if a selected source cell changed or cannot be read', async () => {
    for (const original of ['changed@example.com', { formula: '"jane@example.com"' }]) {
      const source = await workbook([original])
      const output = nextPath('existing.xlsx')
      await writeFile(output, 'existing export')
      expect(await redactFile(source, output, [finding('A1', 'jane@example.com')])).toMatchObject({ success: false })
      expect(await readFile(output, 'utf8')).toBe('existing export')
    }
    expect(() => redactSelectedCell('not a phone', [finding('A1', 'not a phone', 'phone')])).toThrow('Unable to redact')
  })
  it('uses the same complete masked preview for scanning and selected export', async () => {
    const source = await workbook(['Contact first@example.com and second@example.com', '+1 415-555-2671', '123456789'])
    const { sheets } = await readWorkbook(source)
    const scan = await scanForPiiFromSheets(sheets)
    expect(scan.success).toBe(true)
    expect(scan.findings).toHaveLength(3)
    for (const selected of scan.findings) {
      expect(redactSelectedCell(selected.original_value, [selected])).toBe(selected.masked_value)
    }
  })
  it('roundtrips multiple PII types and repeated emails in one cell in either finding order', async () => {
    const original = 'first@example.com; call +1 415-555-2671; second@example.com'
    const source = await workbook([original])
    const { sheets } = await readWorkbook(source)
    const scan = await scanForPiiFromSheets(sheets)
    expect(scan.success).toBe(true)
    expect(scan.findings.map((item) => item.pii_type).sort()).toEqual(['email', 'phone'])
    expect(scan.findings.find((item) => item.pii_type === 'email')?.masked_value).toBe('f***@example.com; call +1 415-555-2671; s***@example.com')
    const expected = 'f***@example.com; call 141****2671; s***@example.com'
    for (const selected of [scan.findings, [...scan.findings].reverse()]) {
      const output = nextPath('mixed.xlsx')
      expect(await redactFile(source, output, selected)).toMatchObject({ success: true, redactedCount: 1 })
      expect(await values(output)).toEqual([expected])
    }
  })
  it('detects a validated later match after an invalid first match and deduplicates by cell and type', async () => {
    const source = await workbook(['bad 4111111111111112; valid 4111111111111111; valid again 4111111111111111'])
    const { sheets } = await readWorkbook(source)
    const scan = await scanForPiiFromSheets(sheets)
    expect(scan.success).toBe(true)
    const cards = scan.findings.filter((item) => item.pii_type === 'credit_card')
    expect(cards).toHaveLength(1)
    expect(cards[0].masked_value).toBe('bad 4111111111111112; valid ****-****-****-1111; valid again ****-****-****-1111')
    const output = nextPath('valid-later.xlsx')
    expect(await redactFile(source, output, scan.findings)).toMatchObject({ success: true, redactedCount: 1 })
    expect(await values(output)).toEqual([cards[0].masked_value])
  })
  it('does not restore an already masked phone when an AI finding is applied later', () => {
    const original = 'jane@example.com and +1 415-555-2671'
    const selected = [finding('A1', original, 'phone'), finding('A1', original, 'email', 'ai-detected')]
    for (const order of [selected, [...selected].reverse()]) {
      expect(redactSelectedCell(original, order)).toBe('j***@example.com and 141****2671')
    }
  })
  it('masks all occurrences and object text during an omitted-findings full scan', async () => {
    const source = await workbook(['first@example.com second@example.com', { richText: [{ text: 'jane@example.com' }] }, { formula: '"jane@example.com"', result: 'jane@example.com' }])
    const output = nextPath('full.xlsx')
    expect(await redactFile(source, output)).toMatchObject({ success: true, redactedCount: 3 })
    expect(await values(output)).toEqual(['f***@example.com s***@example.com', 'j***@example.com', 'j***@example.com'])
  })
  it('masks the full actual cell consistently for an AI finding', () => {
    const selected = finding('A1', 'Alice Example', 'name', 'ai-detected')
    expect(redactSelectedCell(selected.original_value, [selected])).toBe('Al***le')
  })
})

describe('CSV field boundaries', () => {
  it('keeps carriage returns inside a quoted field and escapes a complete table title', async () => {
    const csv = exportToCsv([
      { key: 'k', label: 'Label', value: 'safe\r=1+1', cell: 'A1', sheet_name: 'S', confidence: 1 },
    ], [{ sheet_name: 'S,quoted"', header_row: 1, headers: ['=1+1'], rows: [['\t@SUM(A1:A2)'], ['-12']], start_cell: 'A1', end_cell: 'A3' }])
    const wb = new ExcelJS.Workbook()
    const ws = await wb.csv.read(Readable.from([csv]))
    expect(ws.getCell('B2').value).toBe('safe\r=1+1')
    expect(ws.getCell('A4').value).toBe('Table: S,quoted" (A1:A3)')
    expect(ws.getCell('A5').value).toBe("'=1+1")
    expect(ws.getCell('A6').value).toBe("'\t@SUM(A1:A2)")
    expect(ws.getCell('A7').value).toBe(-12)
  })
})
