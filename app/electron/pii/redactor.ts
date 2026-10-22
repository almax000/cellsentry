/** Creates a separate workbook with selected PII replaced by plain masked text. */
import type ExcelJS from 'exceljs'
import { PII_PATTERNS } from './patterns'
import type { PiiFinding } from './types'
import { maskPiiText, maskValue } from './masking'
import { assertDistinctOutput } from '../exportSafety'

export interface RedactResult {
  success: boolean
  outputPath?: string
  redactedCount?: number
  error?: string
}

/** Read displayed values without serializing ExcelJS objects as [object Object]. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value !== 'object') return String(value)
  if (value instanceof Date) return value.toISOString()
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result == null || typeof value.result === 'object') {
      throw new Error('Cannot redact a formula without a supported cached value')
    }
    return String(value.result)
  }
  if ('hyperlink' in value) return value.text
  throw new Error('Cannot redact this cell value type')
}

/** An explicit empty selection leaves all cells untouched; omitted findings scans all. */
export async function redactFile(filePath: string, outputPath: string, findings?: PiiFinding[]): Promise<RedactResult> {
  try {
    await assertDistinctOutput(filePath, outputPath)
    const { loadWorkbook } = await import('../engine/excelReader')
    const wb = await loadWorkbook(filePath)
    let redactedCount = 0
    if (findings !== undefined) {
      const cells = new Map<string, PiiFinding[]>()
      for (const finding of findings) {
        const key = `${finding.sheet_name}!${finding.cell}`
        cells.set(key, [...(cells.get(key) || []), finding])
      }
      for (const cellFindings of cells.values()) {
        const first = cellFindings[0]
        const ws = wb.getWorksheet(first.sheet_name)
        if (!ws || !/^[A-Z]+[1-9]\d*$/i.test(first.cell)) throw new Error('A selected PII cell no longer exists; scan the source again')
        const cell = ws.getCell(first.cell)
        const original = cellText(cell.value)
        const redacted = redactSelectedCell(original, cellFindings)
        // Flatten formula, hyperlink and rich text values so their original payload cannot leak.
        cell.value = redacted
        redactedCount++
      }
    } else {
      for (const ws of wb.worksheets) {
        ws.eachRow((row) => row.eachCell((cell) => {
          const original = cellText(cell.value)
          let redacted = original
          for (const type of new Set(PII_PATTERNS.map((pattern) => pattern.type))) {
            redacted = maskPiiText(redacted, type)
          }
          if (redacted !== original) {
            cell.value = redacted
            redactedCount++
          }
        }))
      }
    }
    // Check again after reading and transforming, before writing any output bytes.
    await assertDistinctOutput(filePath, outputPath)
    await wb.xlsx.writeFile(outputPath)
    return { success: true, outputPath, redactedCount }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function redactSelectedCell(value: string, findings: PiiFinding[]): string {
  let redacted = value
  for (const finding of findings) {
    if (value !== finding.original_value) throw new Error('A selected PII cell changed; scan the source again')
    if (finding.pattern === 'ai-detected') {
      const masked = maskValue(redacted, finding.pii_type)
      if (maskValue(value, finding.pii_type) === value) throw new Error('Unable to redact a selected PII finding')
      redacted = masked
    } else {
      if (maskPiiText(value, finding.pii_type) === value) throw new Error('Unable to redact a selected PII finding; scan the source again')
      redacted = maskPiiText(redacted, finding.pii_type)
    }
  }
  if (findings.length > 0 && redacted === value) throw new Error('Unable to redact a selected PII finding')
  return redacted
}
