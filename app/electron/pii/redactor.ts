/**
 * PII redactor — creates a copy of an Excel file with PII values masked.
 */

import ExcelJS from 'exceljs'
import { PII_PATTERNS } from './patterns'
import type { PiiFinding } from './types'

export interface RedactResult {
  success: boolean
  outputPath?: string
  redactedCount?: number
  error?: string
}

/**
 * Replace the middle portion of a matched value with asterisks.
 * Keeps a short prefix/suffix so the cell remains recognizable.
 */
function mask(value: string, matchedText: string): string {
  if (matchedText.length <= 4) return value.replace(matchedText, '****')

  const first = matchedText.substring(0, 2)
  const last = matchedText.substring(matchedText.length - 2)
  const stars = '*'.repeat(Math.min(matchedText.length - 4, 12))
  return value.replace(matchedText, first + stars + last)
}

/**
 * Redact PII from an Excel file and write the result to `outputPath`.
 *
 * When `findings` are supplied only those specific cells are redacted.
 * Otherwise every cell is tested against PII_PATTERNS.
 */
export async function redactFile(
  filePath: string,
  outputPath: string,
  findings?: PiiFinding[],
): Promise<RedactResult> {
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)

    let redactedCount = 0

    if (findings && findings.length > 0) {
      // Targeted redaction: only touch cells listed in findings
      const findingMap = new Map<string, PiiFinding>()
      for (const f of findings) {
        findingMap.set(`${f.sheet_name}!${f.cell}`, f)
      }

      for (const ws of wb.worksheets) {
        for (let row = 1; row <= (ws.rowCount || 0); row++) {
          for (let col = 1; col <= (ws.columnCount || 0); col++) {
            const cell = ws.getCell(row, col)
            if (cell.value == null) continue

            const address = cell.address // e.g. "A1"
            const key = `${ws.name}!${address}`
            const finding = findingMap.get(key)
            if (!finding) continue

            cell.value = finding.masked_value
            redactedCount++
          }
        }
      }
    } else {
      // Full scan: test every cell against all patterns
      for (const ws of wb.worksheets) {
        for (let row = 1; row <= (ws.rowCount || 0); row++) {
          for (let col = 1; col <= (ws.columnCount || 0); col++) {
            const cell = ws.getCell(row, col)
            if (cell.value == null) continue

            const text = String(cell.value)
            if (text.length < 3) continue

            for (const pattern of PII_PATTERNS) {
              const match = text.match(pattern.regex)
              if (!match) continue
              if (pattern.validator && !pattern.validator(match[0])) continue

              cell.value = mask(text, match[0])
              redactedCount++
              break // one redaction per cell
            }
          }
        }
      }
    }

    await wb.xlsx.writeFile(outputPath)

    return { success: true, outputPath, redactedCount }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
