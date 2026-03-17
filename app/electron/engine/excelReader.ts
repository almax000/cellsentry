/**
 * ExcelJS adapter — reads Excel files into engine abstractions.
 *
 * Replaces openpyxl usage from src/rule_engine.py and src/sidecar_server.py.
 */

import { Workbook, Cell as ExcelCell, CellValue, CellFormulaValue, CellRichTextValue } from 'exceljs'
import { CellInfo, SheetContext } from './types'
import { getColumnLetter, columnToNumber } from './utils'

function extractPlainText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'richText' in (value as CellRichTextValue)) {
    return (value as CellRichTextValue).richText.map((r) => r.text).join('')
  }
  return String(value)
}

function buildCellInfo(cell: ExcelCell, row: number, col: number): CellInfo {
  const address = `${getColumnLetter(col)}${row}`
  let value: unknown = cell.value
  let formula: string | null = null
  let dataType = 'empty'

  // ExcelJS formula cells: { formula: '...', result: ... }
  if (value && typeof value === 'object' && 'formula' in (value as CellFormulaValue)) {
    const fv = value as CellFormulaValue
    formula = '=' + fv.formula
    value = fv.result !== undefined ? fv.result : null
    dataType = 'formula'
  } else if (value && typeof value === 'object' && 'richText' in (value as CellRichTextValue)) {
    value = extractPlainText(value as CellValue)
    dataType = 'text'
  } else if (value === null || value === undefined) {
    dataType = 'empty'
  } else if (typeof value === 'string') {
    if (value.startsWith('=')) {
      formula = value
      dataType = 'formula'
    } else {
      dataType = 'text'
    }
  } else if (typeof value === 'boolean') {
    dataType = 'bool'
  } else if (typeof value === 'number') {
    dataType = 'number'
  } else if (value instanceof Date) {
    dataType = 'date'
  } else {
    dataType = 'unknown'
  }

  let lenVisible = 0
  let lenActual = 0
  let hasHiddenChars = false
  if (typeof value === 'string') {
    lenActual = value.length
    lenVisible = value.trim().length
    hasHiddenChars = lenActual !== lenVisible
  }

  return {
    address,
    value,
    formula,
    dataType,
    numberFormat: cell.numFmt || null,
    isMerged: cell.isMerged || false,
    row,
    column: col,
    lenVisible,
    lenActual,
    hasHiddenChars,
  }
}

function buildSheetContext(ws: import('exceljs').Worksheet): SheetContext {
  const maxRow = ws.rowCount || 0
  const maxColumn = ws.columnCount || 0
  const cells: Record<string, CellInfo> = {}
  const headers: Record<number, string> = {}
  const rowLabels: Record<number, string> = {}

  // Extract headers (row 1)
  for (let col = 1; col <= maxColumn; col++) {
    const cell = ws.getCell(1, col)
    if (cell.value !== null && cell.value !== undefined) {
      headers[col] = extractPlainText(cell.value as CellValue)
    }
  }

  // Extract row labels (column 1)
  for (let row = 1; row <= maxRow; row++) {
    const cell = ws.getCell(row, 1)
    if (cell.value !== null && cell.value !== undefined) {
      rowLabels[row] = extractPlainText(cell.value as CellValue)
    }
  }

  // Build cell info for all cells
  for (let row = 1; row <= maxRow; row++) {
    for (let col = 1; col <= maxColumn; col++) {
      const cell = ws.getCell(row, col)
      if (cell.value === null || cell.value === undefined) continue
      const info = buildCellInfo(cell, row, col)
      cells[info.address] = info
    }
  }

  // Merged ranges
  const mergedRanges: string[] = []
  if (ws.model && ws.model.merges) {
    for (const m of ws.model.merges) {
      mergedRanges.push(m)
    }
  }

  return {
    name: ws.name,
    maxRow,
    maxColumn,
    cells,
    mergedRanges,
    headers,
    rowLabels,
    reportType: null,
  }
}

export async function readWorkbook(
  filePath: string,
): Promise<{ sheets: SheetContext[] }> {
  const wb = new Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets: SheetContext[] = []
  for (const ws of wb.worksheets) {
    sheets.push(buildSheetContext(ws))
  }
  return { sheets }
}

export async function getFileInfo(
  filePath: string,
): Promise<{
  success: boolean
  fileName?: string
  sheets?: Array<{ name: string; rows: number; cols: number }>
  totalCells?: number
  error?: string
}> {
  try {
    const wb = new Workbook()
    await wb.xlsx.readFile(filePath)
    let totalCells = 0
    const sheets = wb.worksheets.map((ws) => {
      let cellCount = 0
      ws.eachRow((row) => { row.eachCell(() => { cellCount++ }) })
      totalCells += cellCount
      return {
        name: ws.name,
        rows: ws.rowCount || 0,
        cols: ws.columnCount || 0,
      }
    })
    const parts = filePath.replace(/\\/g, '/').split('/')
    return { success: true, fileName: parts[parts.length - 1], sheets, totalCells }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

function parseRange(range: string): { startCol: number; startRow: number; endCol: number; endRow: number } {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i)
  if (!match) {
    return { startCol: 1, startRow: 1, endCol: 26, endRow: 100 }
  }
  return {
    startCol: columnToNumber(match[1]),
    startRow: parseInt(match[2], 10),
    endCol: columnToNumber(match[3]),
    endRow: parseInt(match[4], 10),
  }
}

export async function readFileCells(
  filePath: string,
  sheetName: string,
  range: string,
): Promise<{
  success: boolean
  columns?: string[]
  rows?: Array<Array<{ value: string; formula: string }>>
  sheetName?: string
  error?: string
}> {
  try {
    const wb = new Workbook()
    await wb.xlsx.readFile(filePath)
    const ws = wb.getWorksheet(sheetName)
    if (!ws) {
      return { success: false, error: `Sheet not found: ${sheetName}` }
    }

    const { startCol, startRow, endCol, endRow } = parseRange(range)
    const actualEndCol = Math.min(endCol, ws.columnCount || endCol)
    const actualEndRow = Math.min(endRow, ws.rowCount || endRow)

    const columns: string[] = []
    for (let c = startCol; c <= actualEndCol; c++) {
      columns.push(getColumnLetter(c))
    }

    const rows: Array<Array<{ value: string; formula: string }>> = []
    for (let r = startRow; r <= actualEndRow; r++) {
      const rowData: Array<{ value: string; formula: string }> = []
      for (let c = startCol; c <= actualEndCol; c++) {
        const cell = ws.getCell(r, c)
        const cellData: { value: string; formula: string } = { value: '', formula: '' }

        const v = cell.value
        if (v && typeof v === 'object' && 'formula' in (v as CellFormulaValue)) {
          const fv = v as CellFormulaValue
          cellData.formula = '=' + fv.formula
          cellData.value = fv.result !== undefined && fv.result !== null ? String(fv.result) : ''
        } else if (v !== null && v !== undefined) {
          cellData.value = extractPlainText(v as CellValue)
        }

        rowData.push(cellData)
      }
      rows.push(rowData)
    }

    return { success: true, columns, rows, sheetName: ws.name }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
