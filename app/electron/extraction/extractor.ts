/**
 * Data Extraction Engine — Main orchestrator.
 *
 * Reads an Excel file, detects document type, extracts key-value fields
 * using template-driven keyword matching, and detects table regions by
 * scanning for header patterns.
 */

import { readWorkbook } from '../engine/excelReader'
import type { SheetContext } from '../engine/types'
import { getColumnLetter } from '../engine/utils'
import { detectDocumentType } from './detector'
import { EXTRACTION_TEMPLATES } from './templates'
import type {
  ExtractionField,
  ExtractionTemplate,
  ExtractedTable,
  ExtractionResult,
  FieldPattern,
} from './types'
import { DocumentType } from './types'

const HIGH_CONFIDENCE = 0.9
const NEARBY_CONFIDENCE = 0.7
const MIN_TABLE_HEADER_MATCHES = 2

function cellValueString(cell: { value: unknown }): string {
  if (cell.value === null || cell.value === undefined) return ''
  if (cell.value instanceof Date) return cell.value.toISOString().split('T')[0]
  return String(cell.value)
}

function findFieldValue(
  sheet: SheetContext,
  pattern: FieldPattern,
): { value: string; cell: string; confidence: number } | null {
  const { keywords, position } = pattern

  for (const cell of Object.values(sheet.cells)) {
    const text = cellValueString(cell).toLowerCase().trim()
    if (!text) continue

    const isMatch = keywords.some((kw) => text === kw.toLowerCase() || text.includes(kw.toLowerCase()))
    if (!isMatch) continue

    let targetRow = cell.row
    let targetCol = cell.column
    if (position === 'right') {
      targetCol = cell.column + 1
    } else {
      targetRow = cell.row + 1
    }

    const targetAddress = `${getColumnLetter(targetCol)}${targetRow}`
    const targetCell = sheet.cells[targetAddress]
    if (!targetCell) continue

    const value = cellValueString(targetCell).trim()
    if (!value) continue

    return { value, cell: targetAddress, confidence: HIGH_CONFIDENCE }
  }

  // Fallback: check row labels for a nearby match (less precise)
  for (const [rowStr, label] of Object.entries(sheet.rowLabels)) {
    const lowerLabel = label.toLowerCase()
    const isMatch = keywords.some((kw) => lowerLabel.includes(kw.toLowerCase()))
    if (!isMatch) continue

    const row = Number(rowStr)
    // Try columns 2-10 for a non-empty value
    for (let col = 2; col <= Math.min(10, sheet.maxColumn); col++) {
      const addr = `${getColumnLetter(col)}${row}`
      const targetCell = sheet.cells[addr]
      if (!targetCell) continue
      const value = cellValueString(targetCell).trim()
      if (!value) continue
      return { value, cell: addr, confidence: NEARBY_CONFIDENCE }
    }
  }

  return null
}

function extractFields(
  sheet: SheetContext,
  template: ExtractionTemplate,
): ExtractionField[] {
  const fields: ExtractionField[] = []

  for (const pattern of template.fieldPatterns) {
    const result = findFieldValue(sheet, pattern)
    if (result) {
      fields.push({
        key: pattern.key,
        label: pattern.label,
        value: result.value,
        cell: result.cell,
        sheet_name: sheet.name,
        confidence: result.confidence,
      })
    }
  }

  return fields
}

function extractTables(
  sheet: SheetContext,
  headerPatterns: string[],
): ExtractedTable[] {
  const tables: ExtractedTable[] = []
  const lowerPatterns = headerPatterns.map((p) => p.toLowerCase())

  for (let row = 1; row <= sheet.maxRow; row++) {
    const matchedCols: number[] = []
    const matchedHeaders: string[] = []

    for (let col = 1; col <= sheet.maxColumn; col++) {
      const addr = `${getColumnLetter(col)}${row}`
      const cell = sheet.cells[addr]
      if (!cell) continue

      const text = cellValueString(cell).toLowerCase().trim()
      if (!text) continue

      const isHeader = lowerPatterns.some((p) => text === p || text.includes(p))
      if (isHeader) {
        matchedCols.push(col)
        matchedHeaders.push(cellValueString(cell).trim())
      }
    }

    if (matchedCols.length < MIN_TABLE_HEADER_MATCHES) continue

    // Determine table column range from detected headers
    const startCol = Math.min(...matchedCols)
    const endCol = Math.max(...matchedCols)

    // Collect full headers across the column range
    const headers: string[] = []
    for (let col = startCol; col <= endCol; col++) {
      const addr = `${getColumnLetter(col)}${row}`
      const cell = sheet.cells[addr]
      headers.push(cell ? cellValueString(cell).trim() : '')
    }

    // Read data rows until an empty row
    const dataRows: string[][] = []
    for (let dataRow = row + 1; dataRow <= sheet.maxRow; dataRow++) {
      let hasValue = false
      const rowData: string[] = []

      for (let col = startCol; col <= endCol; col++) {
        const addr = `${getColumnLetter(col)}${dataRow}`
        const cell = sheet.cells[addr]
        const text = cell ? cellValueString(cell) : ''
        rowData.push(text)
        if (text.trim()) hasValue = true
      }

      if (!hasValue) break
      dataRows.push(rowData)
    }

    if (dataRows.length === 0) continue

    const lastDataRow = row + dataRows.length
    tables.push({
      sheet_name: sheet.name,
      header_row: row,
      headers,
      rows: dataRows,
      start_cell: `${getColumnLetter(startCol)}${row}`,
      end_cell: `${getColumnLetter(endCol)}${lastDataRow}`,
    })
  }

  return tables
}

export async function extractDocument(filePath: string): Promise<ExtractionResult> {
  const start = Date.now()

  try {
    const { sheets } = await readWorkbook(filePath)

    if (sheets.length === 0) {
      return {
        success: false,
        document_type: DocumentType.UNKNOWN,
        fields: [],
        tables: [],
        duration: Date.now() - start,
        scannedAt: new Date().toISOString(),
        error: 'No sheets found in workbook',
      }
    }

    const detection = detectDocumentType(sheets)
    const template = EXTRACTION_TEMPLATES.find((t) => t.docType === detection.type)

    const allFields: ExtractionField[] = []
    const allTables: ExtractedTable[] = []

    for (const sheet of sheets) {
      if (template) {
        const fields = extractFields(sheet, template)
        allFields.push(...fields)

        const tables = extractTables(sheet, template.headerPatterns)
        allTables.push(...tables)
      } else {
        // No template matched — try generic table extraction with all header patterns
        const genericHeaders = EXTRACTION_TEMPLATES.flatMap((t) => t.headerPatterns)
        const uniqueHeaders = [...new Set(genericHeaders)]
        const tables = extractTables(sheet, uniqueHeaders)
        allTables.push(...tables)
      }
    }

    return {
      success: true,
      document_type: detection.type,
      fields: allFields,
      tables: allTables,
      duration: Date.now() - start,
      scannedAt: new Date().toISOString(),
    }
  } catch (e) {
    return {
      success: false,
      document_type: DocumentType.UNKNOWN,
      fields: [],
      tables: [],
      duration: Date.now() - start,
      scannedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
