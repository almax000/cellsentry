/**
 * Consistency Rules — ported from src/rules/consistency_rules.py
 *
 * - InconsistentFormulaRule (check_excel)
 * - EmptyCellReferencesRule (check_excel)
 * - TwoDigitYearRule (check_excel)
 */

import {
  BaseRule,
  CellInfo,
  ConfidenceLevel,
  EngineIssue,
  IssueType,
  SheetContext,
  createIssue,
  getCell,
  getCellByRC,
  isFormula,
} from '../types'
import { columnToNumber, extractCellReferences, getColumnLetter } from '../utils'
import { RuleRegistry } from '../registry'
import { msg } from '../locale'

// ── Helper types & functions ─────────────────────────────────────────

type PatternItem =
  | ['REF', ['ABS' | 'REL', number], ['ABS' | 'REL', number]]
  | ['OP', string]

function parseReference(ref: string): [boolean, string, boolean, number] {
  let r = ref.toUpperCase().trim()
  const colAbsolute = r.startsWith('$')
  if (colAbsolute) r = r.slice(1)

  let col = ''
  let rowStr = ''
  for (let i = 0; i < r.length; i++) {
    const c = r[i]
    if (/[A-Z]/.test(c)) {
      col += c
    } else if (c === '$') {
      rowStr = r.slice(i + 1)
      return [colAbsolute, col, true, rowStr ? parseInt(rowStr, 10) : 0]
    } else {
      rowStr = r.slice(i)
      break
    }
  }

  return [colAbsolute, col, false, rowStr ? parseInt(rowStr, 10) : 0]
}

function extractFormulaPattern(
  formula: string,
  cellRow: number,
  cellCol: number,
): PatternItem[] {
  if (!formula || !formula.startsWith('=')) return []

  const pattern: PatternItem[] = []
  const body = formula.slice(1) // remove leading =

  const refPattern = /\$?([A-Z]+)\$?(\d+)/gi
  let lastEnd = 0
  let m: RegExpExecArray | null

  while ((m = refPattern.exec(body)) !== null) {
    if (m.index > lastEnd) {
      const between = body.slice(lastEnd, m.index).trim()
      if (between) pattern.push(['OP', between])
    }

    const fullMatch = m[0]
    const [colAbs, col, rowAbs, row] = parseReference(fullMatch)
    const colNum = columnToNumber(col)

    const colOffset: ['ABS' | 'REL', number] = colAbs
      ? ['ABS', colNum]
      : ['REL', colNum - cellCol]
    const rowOffset: ['ABS' | 'REL', number] = rowAbs
      ? ['ABS', row]
      : ['REL', row - cellRow]

    pattern.push(['REF', colOffset, rowOffset])
    lastEnd = m.index + m[0].length
  }

  if (lastEnd < body.length) {
    const remaining = body.slice(lastEnd).trim()
    if (remaining) pattern.push(['OP', remaining])
  }

  return pattern
}

function patternsMatch(
  pattern1: PatternItem[],
  pattern2: PatternItem[],
): boolean {
  if (pattern1.length !== pattern2.length) return false

  for (let i = 0; i < pattern1.length; i++) {
    const p1 = pattern1[i]
    const p2 = pattern2[i]

    if (p1[0] !== p2[0]) return false

    if (p1[0] === 'REF' && p2[0] === 'REF') {
      const [, col1, row1] = p1
      const [, col2, row2] = p2
      if (col1[0] !== col2[0] || col1[1] !== col2[1]) return false
      if (row1[0] !== row2[0] || row1[1] !== row2[1]) return false
    } else if (p1[0] === 'OP' && p2[0] === 'OP') {
      if (p1[1].toUpperCase() !== p2[1].toUpperCase()) return false
    }
  }

  return true
}

function suggestCorrectFormula(
  pattern: PatternItem[],
  targetRow: number,
  targetCol: number,
): string {
  let result = '='

  for (const item of pattern) {
    if (item[0] === 'REF') {
      const [, colInfo, rowInfo] = item
      const colStr =
        colInfo[0] === 'ABS'
          ? '$' + getColumnLetter(colInfo[1])
          : getColumnLetter(targetCol + colInfo[1])
      const rowStr =
        rowInfo[0] === 'ABS'
          ? '$' + String(rowInfo[1])
          : String(targetRow + rowInfo[1])
      result += colStr + rowStr
    } else if (item[0] === 'OP') {
      result += item[1]
    }
  }

  return result
}

// ── InconsistentFormulaRule ──────────────────────────────────────────

const MIN_ADJACENT_FORMULAS = 2

export const InconsistentFormulaRule: BaseRule = {
  ruleId: 'INCONSISTENT_FORMULA',
  ruleName: '公式不一致检测',
  issueType: IssueType.UNKNOWN,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测公式模式是否与相邻单元格一致',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    const cellRow = cell.row
    const cellCol = cell.column

    const currentPattern = extractFormulaPattern(cell.formula!, cellRow, cellCol)
    if (currentPattern.length === 0) return null

    const adjacentPatterns: [PatternItem[], CellInfo, string][] = []

    // Check cells above
    for (let r = cellRow - 1; r > Math.max(0, cellRow - 5); r--) {
      const adj = getCellByRC(context, r, cellCol)
      if (adj && isFormula(adj)) {
        const p = extractFormulaPattern(adj.formula!, r, cellCol)
        if (p.length) adjacentPatterns.push([p, adj, 'above'])
      } else {
        break
      }
    }

    // Check cells below
    for (let r = cellRow + 1; r < Math.min(context.maxRow + 1, cellRow + 5); r++) {
      const adj = getCellByRC(context, r, cellCol)
      if (adj && isFormula(adj)) {
        const p = extractFormulaPattern(adj.formula!, r, cellCol)
        if (p.length) adjacentPatterns.push([p, adj, 'below'])
      } else {
        break
      }
    }

    // Check cells to the left
    for (let c = cellCol - 1; c > Math.max(0, cellCol - 5); c--) {
      const adj = getCellByRC(context, cellRow, c)
      if (adj && isFormula(adj)) {
        const p = extractFormulaPattern(adj.formula!, cellRow, c)
        if (p.length) adjacentPatterns.push([p, adj, 'left'])
      } else {
        break
      }
    }

    // Check cells to the right
    for (let c = cellCol + 1; c < Math.min(context.maxColumn + 1, cellCol + 5); c++) {
      const adj = getCellByRC(context, cellRow, c)
      if (adj && isFormula(adj)) {
        const p = extractFormulaPattern(adj.formula!, cellRow, c)
        if (p.length) adjacentPatterns.push([p, adj, 'right'])
      } else {
        break
      }
    }

    if (adjacentPatterns.length < MIN_ADJACENT_FORMULAS) return null

    let matchingCount = 0
    const nonMatching: [PatternItem[], CellInfo, string][] = []

    for (const [adjPattern, adjCell, direction] of adjacentPatterns) {
      if (patternsMatch(currentPattern, adjPattern)) {
        matchingCount++
      } else {
        nonMatching.push([adjPattern, adjCell, direction])
      }
    }

    const totalAdjacent = adjacentPatterns.length
    if (matchingCount < Math.floor(totalAdjacent / 2) && nonMatching.length > 0) {
      const dominantPattern = nonMatching[0][0]
      const suggestedFormula = suggestCorrectFormula(dominantPattern, cellRow, cellCol)

      return createIssue(this, {
        message: msg(`Inconsistent formula: ${cell.address} pattern differs from adjacent cells`, `公式不一致：${cell.address} 的公式模式与相邻单元格不同`),
        cellAddress: cell.address,
        sheetName: context.name,
        formula: cell.formula,
        confidence: ConfidenceLevel.MEDIUM,
        correctFormula: suggestedFormula,
        suggestion: msg(`Check if the formula should be ${suggestedFormula}`, `检查公式是否应该为 ${suggestedFormula}`),
        details: {
          current_formula: cell.formula,
          suggested_formula: suggestedFormula,
          adjacent_count: totalAdjacent,
          matching_count: matchingCount,
        },
      })
    }

    return null
  },
}

// ── EmptyCellReferencesRule ──────────────────────────────────────────

const IGNORE_FUNCTIONS = new Set([
  'ISBLANK', 'COUNTA', 'COUNTBLANK', 'IF', 'IFERROR', 'IFNA',
])

export const EmptyCellReferencesRule: BaseRule = {
  ruleId: 'EMPTY_CELL_REFERENCES',
  ruleName: '空单元格引用检测',
  issueType: IssueType.UNKNOWN,
  defaultConfidence: ConfidenceLevel.LOW,
  description: '检测公式是否引用了空单元格',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    const formulaUpper = cell.formula!.toUpperCase()

    // Skip if formula uses functions that intentionally check for empty
    for (const func of IGNORE_FUNCTIONS) {
      if (formulaUpper.includes(func)) return null
    }

    const refs = extractCellReferences(cell.formula!)
    const emptyRefs: string[] = []

    for (const ref of refs) {
      const refCell = getCell(context, ref)
      if (refCell && (refCell.value == null || refCell.dataType === 'empty')) {
        emptyRefs.push(ref)
      }
    }

    if (emptyRefs.length > 0) {
      const shownRefs = emptyRefs.slice(0, 5)
      let issueMsg = msg(
        `Formula references empty cells: ${shownRefs.join(', ')}`,
        `公式引用空单元格：${shownRefs.join(', ')}`,
      )
      if (emptyRefs.length > 5) {
        issueMsg += msg(` and ${emptyRefs.length - 5} more`, ` 等 ${emptyRefs.length} 个`)
      }

      return createIssue(this, {
        message: issueMsg,
        cellAddress: cell.address,
        sheetName: context.name,
        formula: cell.formula,
        confidence: ConfidenceLevel.LOW,
        suggestion: msg('Empty cells are treated as 0 in calculations. Check if this is expected or if data is incomplete.', '空单元格在计算中被视为 0。检查这是否是预期行为，或者数据尚未填充完整。'),
        details: {
          empty_references: emptyRefs,
          total_empty: emptyRefs.length,
        },
      })
    }

    return null
  },
}

// ── TwoDigitYearRule ─────────────────────────────────────────────────

const TWO_DIGIT_YEAR_PATTERNS = [
  /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/,        // MM/DD/YY or DD.MM.YY
  /^(\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})$/,        // YY/MM/DD
  /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2})$/,           // Month DD, YY
  /^(\d{1,2})\.?\s+([A-Za-z]+)\s+(\d{2})$/,          // DD Month YY
]

export const TwoDigitYearRule: BaseRule = {
  ruleId: 'TWO_DIGIT_YEAR',
  ruleName: '两位数年份检测',
  issueType: IssueType.DATE_AMBIGUITY,
  defaultConfidence: ConfidenceLevel.MEDIUM,
  description: '检测可能导致世纪解释错误的两位数年份',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (cell.dataType !== 'text' || !cell.value) return null

    const valueStr = String(cell.value).trim()

    for (const pattern of TWO_DIGIT_YEAR_PATTERNS) {
      const match = valueStr.match(pattern)
      if (!match) continue

      const groups = match.slice(1)
      let yearStr: string | null = null

      for (const g of groups) {
        if (g && /^\d{2}$/.test(g)) {
          const yearVal = parseInt(g, 10)
          if (yearVal <= 99) {
            yearStr = g
            break
          }
        }
      }

      if (yearStr) {
        const yearVal = parseInt(yearStr, 10)
        const interpretedYear = yearVal < 30 ? 2000 + yearVal : 1900 + yearVal

        return createIssue(this, {
          message: msg(`Two-digit year: '${yearStr}' in '${valueStr}' may be interpreted as ${interpretedYear}`, `两位数年份：'${valueStr}' 中的 '${yearStr}' 可能被解释为 ${interpretedYear}`),
          cellAddress: cell.address,
          sheetName: context.name,
          confidence: ConfidenceLevel.MEDIUM,
          currentValue: valueStr,
          suggestion: msg(`Use four-digit year (e.g. ${interpretedYear}) to avoid ambiguity`, `建议使用四位数年份（如 ${interpretedYear}）以避免歧义`),
          details: {
            two_digit_year: yearStr,
            interpreted_as: interpretedYear,
            alternative:
              interpretedYear >= 1930
                ? 2000 + yearVal
                : 1900 + yearVal,
          },
        })
      }
    }

    return null
  },
}

// Register rules
RuleRegistry.register(InconsistentFormulaRule)
RuleRegistry.register(EmptyCellReferencesRule)
RuleRegistry.register(TwoDigitYearRule)
