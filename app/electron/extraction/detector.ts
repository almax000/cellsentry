/**
 * Data Extraction Engine — Document type detector.
 *
 * Scores each template against workbook content by counting identifier
 * matches in cell values, headers, and row labels. Returns the best match
 * or UNKNOWN if the score is below threshold.
 */

import type { SheetContext } from '../engine/types'
import { EXTRACTION_TEMPLATES } from './templates'
import { DocumentType } from './types'

const SCAN_ROW_LIMIT = 20
const MIN_SCORE_THRESHOLD = 2

interface DetectionResult {
  type: DocumentType
  score: number
}

function collectSheetText(sheet: SheetContext): string {
  const parts: string[] = []

  for (const headerText of Object.values(sheet.headers)) {
    parts.push(headerText)
  }

  for (const labelText of Object.values(sheet.rowLabels)) {
    parts.push(labelText)
  }

  for (const cell of Object.values(sheet.cells)) {
    if (cell.row > SCAN_ROW_LIMIT) continue
    if (cell.value !== null && cell.value !== undefined) {
      parts.push(String(cell.value))
    }
  }

  return parts.join(' ').toLowerCase()
}

export function detectDocumentType(sheets: SheetContext[]): DetectionResult {
  if (sheets.length === 0) {
    return { type: DocumentType.UNKNOWN, score: 0 }
  }

  const primarySheet = sheets[0]
  const text = collectSheetText(primarySheet)

  let bestType = DocumentType.UNKNOWN
  let bestScore = 0

  for (const template of EXTRACTION_TEMPLATES) {
    let score = 0
    const matched = new Set<string>()

    for (const identifier of template.identifiers) {
      const lower = identifier.toLowerCase()
      if (text.includes(lower) && !matched.has(lower)) {
        score++
        matched.add(lower)
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestType = template.docType
    }
  }

  if (bestScore < MIN_SCORE_THRESHOLD) {
    return { type: DocumentType.UNKNOWN, score: bestScore }
  }

  return { type: bestType, score: bestScore }
}
