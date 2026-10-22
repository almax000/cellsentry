/**
 * Plain-language cell locations for people who do not read A1 notation.
 *
 * "G3" → zh "第 3 行 · G 列", en "Row 3 · Column G".
 * With a sheet: "Invoice Audit · 第 3 行 · G 列".
 * Anything that is not a single A1 address (ranges, names, empty) is returned
 * unchanged so a label is never invented.
 */

export type CellLabelLocale = 'zh' | 'en'

export function cellLabelLocale(language?: string): CellLabelLocale {
  return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

const A1_ADDRESS = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/

export function parseCellAddress(address: string): { column: string; row: number } | null {
  const match = A1_ADDRESS.exec(address.trim())
  if (!match) return null
  const row = Number(match[2])
  if (row < 1) return null
  return { column: match[1].toUpperCase(), row }
}

export function cellLabel(address: string, language?: string, sheetName?: string): string {
  const parsed = parseCellAddress(address)
  const place = !parsed
    ? address
    : cellLabelLocale(language) === 'zh'
      ? `第 ${parsed.row} 行 · ${parsed.column} 列`
      : `Row ${parsed.row} · Column ${parsed.column}`
  const sheet = sheetName?.trim()
  return sheet ? `${sheet} · ${place}` : place
}

/** Excel-pasteable reference, e.g. `'Invoice Audit'!G3`. Technical; keep out of primary text. */
export function excelReference(sheetName: string, address: string): string {
  return `'${sheetName.replace(/'/g, "''")}'!${address}`
}
