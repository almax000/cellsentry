/**
 * CellSentry Engine Utilities
 *
 * Ported from src/rules/base.py helper functions and
 * src/rules/consistency_rules.py column utilities.
 */

import {
  RATIO_KEYWORDS,
  SUMMARY_KEYWORDS,
  FINANCIAL_KEYWORDS,
} from './keywords'

/** Convert column number to letter: 1='A', 2='B', 27='AA' */
export function getColumnLetter(n: number): string {
  let result = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

/** Convert column letter to number: 'A'=1, 'B'=2, 'AA'=27 */
export function columnToNumber(col: string): number {
  let result = 0
  for (const c of col.toUpperCase()) {
    result = result * 26 + (c.charCodeAt(0) - 64)
  }
  return result
}

/** Parse cell reference: 'AB123' -> ['AB', 123] */
export function parseCellReference(ref: string): [string, number] {
  const match = ref.toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (match) {
    return [match[1], parseInt(match[2], 10)]
  }
  return ['', 0]
}

/** Extract all function names from a formula: '=SUM(A1)+COUNT(B2)' -> ['SUM','COUNT'] */
export function extractFormulaFunctions(formula: string): string[] {
  if (!formula) return []
  const pattern = /([A-Z_][A-Z0-9_]*)\s*\(/g
  const upper = formula.toUpperCase()
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(upper)) !== null) {
    results.push(m[1])
  }
  return results
}

/** Extract all cell references from a formula: '=A1+B2:C3' -> ['A1','B2','C3'] */
export function extractCellReferences(formula: string): string[] {
  if (!formula) return []
  const pattern = /(?:'[^']+'!)?([A-Z]+\d+)(?::([A-Z]+\d+))?/g
  const upper = formula.toUpperCase()
  const refs: string[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(upper)) !== null) {
    refs.push(m[1])
    if (m[2]) refs.push(m[2])
  }
  return refs
}

/** Compute Levenshtein edit distance between two strings */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length < s2.length) return levenshteinDistance(s2, s1)
  if (s2.length === 0) return s1.length

  let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i)

  for (let i = 0; i < s1.length; i++) {
    const currentRow = [i + 1]
    for (let j = 0; j < s2.length; j++) {
      const insertions = previousRow[j + 1] + 1
      const deletions = currentRow[j] + 1
      const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0)
      currentRow.push(Math.min(insertions, deletions, substitutions))
    }
    previousRow = currentRow
  }

  return previousRow[previousRow.length - 1]
}

/** Check if text represents a ratio indicator */
export function isRatioHeader(text: string): boolean {
  const lower = text.toLowerCase()
  for (const kw of RATIO_KEYWORDS) {
    if (lower.includes(kw)) return true
  }
  return false
}

/** Check if text represents a summary row */
export function isSummaryRow(text: string): boolean {
  const lower = text.toLowerCase()
  for (const kw of SUMMARY_KEYWORDS) {
    if (lower.includes(kw)) return true
  }
  return false
}

/** Check if text represents a financial statement header */
export function isFinancialHeader(text: string): boolean {
  const lower = text.toLowerCase()
  for (const kw of FINANCIAL_KEYWORDS) {
    if (lower.includes(kw)) return true
  }
  return false
}
