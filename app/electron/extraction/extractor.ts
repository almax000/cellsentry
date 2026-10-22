/**
 * Data Extraction Engine — Main orchestrator.
 *
 * Reads an Excel file, detects document type, extracts key-value fields
 * using template-driven keyword matching, and detects table regions by
 * scanning for header patterns.
 *
 * When the LLM is available and template extraction yields few results
 * (< 3 fields or unknown document type), the LLM is invoked as a fallback
 * to identify the document and fill missing fields.
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
import { analyzeWithLlmExtraction, isLocalAiReadyFor } from '../llm/lifecycle'
import type { LlmCellContext } from '../llm/types'

const HIGH_CONFIDENCE = 0.9
const NEARBY_CONFIDENCE = 0.7
const MIN_TABLE_HEADER_MATCHES = 2
const LLM_CELL_SAMPLE_LIMIT = 200
const LLM_TRIGGER_MIN_FIELDS = 3

function cellValueString(cell: { value: unknown }): string {
  if (cell.value === null || cell.value === undefined) return ''
  if (cell.value instanceof Date) return cell.value.toISOString().split('T')[0]
  return String(cell.value)
}

function normalizeLabel(value: string): string {
  // Spreadsheet labels commonly retain a trailing ASCII or full-width colon.
  // Keep internal punctuation intact so phrase matching remains conservative.
  return value.toLowerCase().trim().replace(/[\s:：]+$/u, '').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasEnglishWordBoundary(text: string, keyword: string): boolean {
  // Template keywords containing Latin letters must not match inside a longer
  // identifier (for example, `total` must not match `subtotal`).
  if (!/[a-z]/i.test(keyword)) return text.includes(keyword)

  const escapedKeyword = escapeRegExp(keyword)
  return new RegExp(`(?:^|[^a-z0-9])${escapedKeyword}(?=$|[^a-z0-9])`, 'i').test(text)
}

function findTargetValue(
  sheet: SheetContext,
  position: FieldPattern['position'],
  predicate: (label: string) => boolean,
): { value: string; cell: string; confidence: number } | null {
  for (const cell of Object.values(sheet.cells)) {
    if (!predicate(cellValueString(cell))) continue

    const targetRow = position === 'right' ? cell.row : cell.row + 1
    const targetCol = position === 'right' ? cell.column + 1 : cell.column
    const targetAddress = `${getColumnLetter(targetCol)}${targetRow}`
    const targetCell = sheet.cells[targetAddress]
    if (!targetCell) continue

    const value = cellValueString(targetCell).trim()
    if (value) return { value, cell: targetAddress, confidence: HIGH_CONFIDENCE }
  }

  return null
}

function findNearbyRowValue(
  sheet: SheetContext,
  predicate: (label: string) => boolean,
): { value: string; cell: string; confidence: number } | null {
  for (const [rowStr, label] of Object.entries(sheet.rowLabels)) {
    if (!predicate(label)) continue

    const row = Number(rowStr)
    // Try columns 2-10 for a non-empty value
    for (let col = 2; col <= Math.min(10, sheet.maxColumn); col++) {
      const addr = `${getColumnLetter(col)}${row}`
      const targetCell = sheet.cells[addr]
      if (!targetCell) continue
      const value = cellValueString(targetCell).trim()
      if (value) return { value, cell: addr, confidence: NEARBY_CONFIDENCE }
    }
  }

  return null
}

function findFieldValue(
  sheet: SheetContext,
  pattern: FieldPattern,
  otherFieldExactLabels: ReadonlySet<string>,
): { value: string; cell: string; confidence: number } | null {
  const normalizedKeywords = pattern.keywords.map(normalizeLabel).filter(Boolean)
  const isExactLabel = (label: string) => {
    const normalizedLabel = normalizeLabel(label)
    return normalizedKeywords.includes(normalizedLabel)
  }
  const isRelaxedLabel = (label: string) => {
    const normalizedLabel = normalizeLabel(label)
    // A label explicitly owned by another field must not be claimed through
    // substring matching (for example, `Sub-total` is not `total`).
    if (otherFieldExactLabels.has(normalizedLabel)) return false
    return normalizedKeywords.some((keyword) => hasEnglishWordBoundary(normalizedLabel, keyword))
  }

  // Preserve exact labels even when their value is not immediately right of
  // the label; only then accept a relaxed match elsewhere in the sheet.
  return findTargetValue(sheet, pattern.position, isExactLabel)
    ?? findNearbyRowValue(sheet, isExactLabel)
    ?? findTargetValue(sheet, pattern.position, isRelaxedLabel)
    ?? findNearbyRowValue(sheet, isRelaxedLabel)
}

function extractFields(
  sheet: SheetContext,
  template: ExtractionTemplate,
): ExtractionField[] {
  const fields: ExtractionField[] = []

  for (const pattern of template.fieldPatterns) {
    const otherFieldExactLabels = new Set(
      template.fieldPatterns
        .filter((candidate) => candidate.key !== pattern.key)
        .flatMap((candidate) => candidate.keywords.map(normalizeLabel))
        .filter(Boolean),
    )
    const result = findFieldValue(sheet, pattern, otherFieldExactLabels)
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

/**
 * Collect non-empty cell values from sheets for LLM input.
 */
function collectCellSamples(sheets: SheetContext[]): LlmCellContext[] {
  const cells: LlmCellContext[] = []
  for (const sheet of sheets) {
    for (const cell of Object.values(sheet.cells)) {
      if (cells.length >= LLM_CELL_SAMPLE_LIMIT) break
      if (cell.dataType === 'empty' || cell.value == null) continue
      const text = cellValueString(cell).trim()
      if (!text) continue
      cells.push({
        address: `${sheet.name}!${cell.address}`,
        value: text,
        formula: cell.formula || undefined,
      })
    }
    if (cells.length >= LLM_CELL_SAMPLE_LIMIT) break
  }
  return cells
}

export async function extractDocumentFromSheets(sheets: SheetContext[]): Promise<ExtractionResult> {
  const start = Date.now()

  try {
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

    let docType = detection.type
    let aiWarning: string | undefined

    // LLM enrichment: invoke if template extraction is weak and the installed
    // model declares extraction. Otherwise the template result carries no AI warning.
    const weakTemplateResult = allFields.length < LLM_TRIGGER_MIN_FIELDS || docType === DocumentType.UNKNOWN
    if (weakTemplateResult && isLocalAiReadyFor('extraction')) {
      const cellSamples = collectCellSamples(sheets)
      if (cellSamples.length > 0) {
        try {
          const llmResult = await analyzeWithLlmExtraction(cellSamples)
          const sampleAddresses = new Set(cellSamples.map((sample) => sample.address))
          const validDocumentTypes = new Set(Object.values(DocumentType))
          if (llmResult) {
            if (!validDocumentTypes.has(llmResult.documentType as DocumentType)) {
              throw new Error('LLM returned an unsupported document type')
            }
          if (docType === DocumentType.UNKNOWN && llmResult.documentType !== 'unknown') {
            docType = llmResult.documentType as DocumentType
          }

          const existingKeys = new Set(allFields.map((f) => f.key))
          for (const f of llmResult.fields) {
            if (
              !f.key || !f.label || !f.value ||
              !sampleAddresses.has(f.cellAddress) ||
              !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1
            ) continue
            if (existingKeys.has(f.key)) continue
            const bangIdx = f.cellAddress.indexOf('!')
            const sheetName = bangIdx > 0 ? f.cellAddress.substring(0, bangIdx) : sheets[0]?.name || 'Sheet1'
            const cellAddr = bangIdx > 0 ? f.cellAddress.substring(bangIdx + 1) : f.cellAddress

            allFields.push({
              key: f.key,
              label: f.label,
              value: f.value,
              cell: cellAddr,
              sheet_name: sheetName,
              confidence: f.confidence,
            })
            existingKeys.add(f.key)
          }
        }
        } catch (error) {
          // Template fields and tables are deterministic and must survive model failure.
          aiWarning = error instanceof Error ? error.message : String(error)
        }
      }
    }

    return {
      success: true,
      document_type: docType,
      fields: allFields,
      tables: allTables,
      duration: Date.now() - start,
      scannedAt: new Date().toISOString(),
      ...(aiWarning ? { aiWarning } : {}),
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

export async function extractDocument(filePath: string): Promise<ExtractionResult> {
  const { sheets } = await readWorkbook(filePath)
  return extractDocumentFromSheets(sheets)
}
