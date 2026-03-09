/**
 * Data Extraction Engine — Export utilities.
 *
 * Converts extraction results to JSON or CSV format for downstream
 * consumption or file export.
 */

import type { ExtractionField, ExtractedTable } from './types'

export function exportToJson(
  fields: ExtractionField[],
  tables: ExtractedTable[],
): string {
  return JSON.stringify({ fields, tables }, null, 2)
}

function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function exportToCsv(
  fields: ExtractionField[],
  tables: ExtractedTable[],
): string {
  const lines: string[] = []

  // Fields section
  if (fields.length > 0) {
    lines.push('Field,Value,Cell,Sheet,Confidence')
    for (const f of fields) {
      lines.push([
        escapeCsvValue(f.label),
        escapeCsvValue(f.value),
        escapeCsvValue(f.cell),
        escapeCsvValue(f.sheet_name),
        String(f.confidence),
      ].join(','))
    }
  }

  // Tables section
  for (const table of tables) {
    lines.push('')
    lines.push(`Table: ${escapeCsvValue(table.sheet_name)} (${table.start_cell}:${table.end_cell})`)
    lines.push(table.headers.map(escapeCsvValue).join(','))
    for (const row of table.rows) {
      lines.push(row.map(escapeCsvValue).join(','))
    }
  }

  return lines.join('\n')
}
