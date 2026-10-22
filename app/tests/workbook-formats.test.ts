import { Workbook } from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { getFileInfo, loadWorkbook, readFileCells, readWorkbook } from '../electron/engine/excelReader'

let directory: string
beforeAll(async () => {
  const base = resolve(__dirname, '../../tmp/tests')
  await mkdir(base, { recursive: true })
  directory = await mkdtemp(join(base, 'formats-'))
})
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

describe('spreadsheet input formats', () => {
  it('uses the same CSV parser for metadata, analysis and preview without losing identifiers', async () => {
    const path = join(directory, 'identifiers.csv')
    await writeFile(path, 'ID,Card,Amount,Note\n00123,123456789012345678,12.5,"two, parts"\n')
    const info = await getFileInfo(path)
    expect(info.success).toBe(true)
    expect(info.totalCells).toBe(8)
    const { sheets } = await readWorkbook(path)
    expect(sheets[0].cells.A2.value).toBe('00123')
    expect(sheets[0].cells.B2.value).toBe('123456789012345678')
    expect(sheets[0].cells.C2.value).toBe(12.5)
    const preview = await readFileCells(path, 'Sheet1', 'A1:D2')
    expect(preview.rows?.[1].map(cell => cell.value)).toEqual(['00123', '123456789012345678', '12.5', 'two, parts'])
  })

  it('keeps a cached formula result of zero instead of reading it as empty', async () => {
    const path = join(directory, 'zero-results.xlsx')
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Totals')
    sheet.getCell('A1').value = 5
    sheet.getCell('A2').value = 5
    sheet.getCell('B1').value = { formula: 'A1-A2', result: 0 }
    sheet.getCell('B2').value = { formula: 'A1>A2', result: false }
    sheet.getCell('B3').value = { formula: 'A1+A2', result: 10 }
    sheet.getCell('B4').value = { formula: 'A1*A2' }
    await workbook.xlsx.writeFile(path)
    const { sheets } = await readWorkbook(path)
    const cells = sheets[0].cells
    expect(cells.B1).toMatchObject({ formula: '=A1-A2', value: 0, dataType: 'formula' })
    expect(cells.B2.value).toBe(false)
    expect(cells.B3.value).toBe(10)
    // A formula with no cached value in the file is still reported as unknown, not zero.
    expect(cells.B4.value).toBeNull()
  })

  it('rejects legacy XLS with an actionable conversion message', async () => {
    await expect(loadWorkbook(join(directory, 'legacy.xls'))).rejects.toThrow('Save the file as .xlsx or .csv')
  })
  it('reads visible text consistently from hyperlinks, rich text and shared formula results', async () => {
    const path = join(directory, 'rich-cells.xlsx')
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Contacts')
    sheet.getCell('A1').value = { text: 'person@example.test', hyperlink: 'mailto:person@example.test' }
    sheet.getCell('B1').value = { richText: [{ text: 'person@' }, { text: 'example.test' }] }
    sheet.getCell('C1').value = { formula: 'A1', result: 'person@example.test' }
    sheet.getCell('C2').value = { sharedFormula: 'C1', result: 'another@example.test' }
    await workbook.xlsx.writeFile(path)
    const { sheets } = await readWorkbook(path)
    expect(sheets[0].cells.A1.value).toBe('person@example.test')
    expect(sheets[0].cells.B1.value).toBe('person@example.test')
    expect(sheets[0].cells.C2.value).toBe('another@example.test')
    expect(sheets[0].cells.C2.formula).toBe('=A2')
    const preview = await readFileCells(path, 'Contacts', 'A1:C2')
    expect(preview.rows?.[0].map(cell => cell.value)).toEqual(['person@example.test', 'person@example.test', 'person@example.test'])
    expect(preview.rows?.[1][2]).toEqual({ value: 'another@example.test', formula: '=A2' })
  })

})
