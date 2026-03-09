/**
 * Formula Rules — ported from src/rules/formula_rules.py
 *
 * - CircularReferenceRule (check_excel)
 * - FunctionSpellingRule (check_excel)
 * - SumRangeRule (check_excel)
 * - TypeMismatchRule (check_excel)
 */

import {
  BaseRule,
  CellInfo,
  ConfidenceLevel,
  EngineIssue,
  IssueType,
  SheetContext,
  createIssue,
  getCellByRC,
  getCell,
  getColumnType,
  getRowLabel,
  isFormula,
  isNumeric,
} from '../types'
import {
  columnToNumber,
  extractCellReferences,
  extractFormulaFunctions,
  levenshteinDistance,
} from '../utils'
import { SUMMARY_KEYWORDS } from '../keywords'
import { RuleRegistry } from '../registry'

export const VALID_FUNCTIONS: ReadonlySet<string> = new Set([
  // Math
  'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT',
  'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS',
  'COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'COUNTBLANK',
  'MAX', 'MIN', 'LARGE', 'SMALL',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'CEILING', 'FLOOR',
  'ABS', 'SQRT', 'POWER', 'MOD', 'INT', 'TRUNC',
  // Logic
  'IF', 'IFS', 'IFERROR', 'IFNA',
  'AND', 'OR', 'NOT', 'XOR',
  'TRUE', 'FALSE', 'SWITCH', 'CHOOSE',
  // Lookup
  'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'LOOKUP',
  'INDEX', 'MATCH', 'OFFSET',
  'INDIRECT', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS',
  // Text
  'LEFT', 'RIGHT', 'MID', 'LEN',
  'UPPER', 'LOWER', 'PROPER', 'TRIM', 'CLEAN',
  'CONCATENATE', 'CONCAT', 'TEXTJOIN',
  'TEXT', 'VALUE', 'FIXED',
  'FIND', 'SEARCH', 'SUBSTITUTE', 'REPLACE',
  // Date
  'DATE', 'DATEVALUE', 'TODAY', 'NOW',
  'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'WEEKNUM',
  'HOUR', 'MINUTE', 'SECOND',
  'DATEDIF', 'EDATE', 'EOMONTH', 'NETWORKDAYS', 'WORKDAY',
  // Finance
  'PMT', 'PPMT', 'IPMT', 'CUMIPMT', 'CUMPRINC',
  'PV', 'FV', 'NPV', 'IRR', 'MIRR', 'XIRR', 'XNPV',
  'RATE', 'NPER', 'SLN', 'SYD', 'DDB', 'DB', 'VDB',
  'EFFECT', 'NOMINAL', 'RECEIVED', 'DISC', 'INTRATE',
  'ACCRINT', 'ACCRINTM', 'PRICE', 'YIELD',
  // Statistics
  'MEDIAN', 'MODE', 'STDEV', 'VAR',
  'PERCENTILE', 'QUARTILE', 'RANK',
  // Other
  'ISBLANK', 'ISERROR', 'ISNA', 'ISNUMBER', 'ISTEXT',
  'NA', 'ERROR.TYPE',
])

export const COMMON_MISSPELLINGS: ReadonlyMap<string, string> = new Map([
  ['SUMM', 'SUM'], ['SUME', 'SUM'], ['SUOM', 'SUM'],
  ['AVRG', 'AVERAGE'], ['AVERGE', 'AVERAGE'], ['AVRAGE', 'AVERAGE'],
  ['CONUT', 'COUNT'], ['COUNTT', 'COUNT'], ['CCOUNT', 'COUNT'],
  ['VLOKUP', 'VLOOKUP'], ['VLOOUP', 'VLOOKUP'], ['VLOOKPU', 'VLOOKUP'],
  ['HLOKUP', 'HLOOKUP'],
  ['IDEX', 'INDEX'],
  ['MACH', 'MATCH'], ['MACTH', 'MATCH'], ['MATCG', 'MATCH'],
  ['IFERR', 'IFERROR'], ['IFFEROR', 'IFERROR'],
  ['CONCATENTE', 'CONCATENATE'], ['CONCATINATE', 'CONCATENATE'],
  ['DATEDIFF', 'DATEDIF'],
  ['ROUNDOWN', 'ROUNDDOWN'],
  ['ROUDUP', 'ROUNDUP'],
])

function findSimilarFunction(
  func: string,
  threshold = 0.7,
): string | null {
  const upper = func.toUpperCase()
  let bestMatch: string | null = null
  let bestScore = 0

  for (const validFunc of VALID_FUNCTIONS) {
    const distance = levenshteinDistance(upper, validFunc)
    const maxLen = Math.max(upper.length, validFunc.length)
    const score = maxLen > 0 ? 1.0 - distance / maxLen : 0

    if (score > bestScore && score >= threshold) {
      bestScore = score
      bestMatch = validFunc
    }
  }

  return bestMatch
}

// ── CircularReferenceRule ────────────────────────────────────────────

export const CircularReferenceRule: BaseRule = {
  ruleId: 'CIRCULAR_REFERENCE',
  ruleName: '循环引用检测',
  issueType: IssueType.CIRCULAR_REFERENCE,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测公式是否引用了自身单元格',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    const refs = extractCellReferences(cell.formula!)
    const cellAddr = cell.address.toUpperCase()

    if (refs.includes(cellAddr)) {
      return createIssue(this, {
        message: `循环引用：${cellAddr} 的公式引用了自身`,
        cellAddress: cellAddr,
        sheetName: context.name,
        formula: cell.formula,
        confidence: ConfidenceLevel.HIGH,
        suggestion: '移除公式中对自身的引用，或使用启用迭代计算（仅限财务建模场景）',
        details: { rule: 'circular_reference', self_ref: cellAddr },
      })
    }

    return null
  },
}

// ── FunctionSpellingRule ─────────────────────────────────────────────

export const FunctionSpellingRule: BaseRule = {
  ruleId: 'FUNCTION_SPELLING',
  ruleName: '函数拼写错误检测',
  issueType: IssueType.FUNCTION_SPELLING,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测公式中的函数名是否拼写正确',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    const funcs = extractFormulaFunctions(cell.formula!)

    for (const func of funcs) {
      // Known misspelling
      const correctFunc = COMMON_MISSPELLINGS.get(func)
      if (correctFunc) {
        return createIssue(this, {
          message: `函数拼写错误：${func} 应该是 ${correctFunc}`,
          cellAddress: cell.address,
          sheetName: context.name,
          formula: cell.formula,
          confidence: ConfidenceLevel.HIGH,
          correctFormula: cell.formula!.toUpperCase().replace(func, correctFunc),
          suggestion: `将 ${func} 改为 ${correctFunc}`,
          details: { wrong: func, correct: correctFunc },
        })
      }

      // Unknown function — find similar
      if (!VALID_FUNCTIONS.has(func) && func.length > 1) {
        const similar = findSimilarFunction(func)
        if (similar) {
          return createIssue(this, {
            message: `函数拼写错误：${func} 可能应该是 ${similar}`,
            cellAddress: cell.address,
            sheetName: context.name,
            formula: cell.formula,
            confidence: ConfidenceLevel.MEDIUM,
            correctFormula: cell.formula!.toUpperCase().replace(func, similar),
            suggestion: `检查是否应该使用 ${similar}`,
            details: { wrong: func, suggest: similar },
          })
        }
      }
    }

    return null
  },
}

// ── SumRangeRule ─────────────────────────────────────────────────────

export const SumRangeRule: BaseRule = {
  ruleId: 'SUM_RANGE_INCOMPLETE',
  ruleName: 'SUM 范围不完整检测',
  issueType: IssueType.SUM_RANGE_INCOMPLETE,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测 SUM 范围是否遗漏了相邻的数据',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    const formula = cell.formula!.toUpperCase()
    if (!formula.includes('SUM')) return null

    const match = formula.match(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/)
    if (!match) return null

    const colStart = match[1]
    const rowStart = parseInt(match[2], 10)
    const colEnd = match[3]
    const rowEnd = parseInt(match[4], 10)
    const colIdx = columnToNumber(colStart)

    // Method 1: consecutive data below range
    let consecutiveBelow = 0
    let checkRow = rowEnd + 1
    while (checkRow <= context.maxRow) {
      const nextCell = getCellByRC(context, checkRow, colIdx)
      if (nextCell && isNumeric(nextCell)) {
        const label = getRowLabel(context, checkRow)
        if (label && [...SUMMARY_KEYWORDS].some((kw) => label.toLowerCase().includes(kw))) {
          break
        }
        consecutiveBelow++
        checkRow++
      } else {
        break
      }
    }

    if (consecutiveBelow > 0) {
      return createIssue(this, {
        message: `SUM 范围不完整：${colStart}${rowStart}:${colEnd}${rowEnd} 下方还有 ${consecutiveBelow} 个数值未被包含`,
        cellAddress: cell.address,
        sheetName: context.name,
        formula: cell.formula,
        confidence: ConfidenceLevel.HIGH,
        expectedValue: `=SUM(${colStart}${rowStart}:${colEnd}${rowEnd + consecutiveBelow})`,
        suggestion: `建议扩展范围至 ${colEnd}${rowEnd + consecutiveBelow}`,
        details: {
          original_range: `${colStart}${rowStart}:${colEnd}${rowEnd}`,
          missing_rows: consecutiveBelow,
        },
      })
    }

    // Method 2: sparse data below (within 4 rows)
    const missingBelow: number[] = []
    for (let r = rowEnd + 1; r < Math.min(rowEnd + 5, context.maxRow + 1); r++) {
      const nextCell = getCellByRC(context, r, colIdx)
      if (nextCell) {
        const label = getRowLabel(context, r)
        if (label && [...SUMMARY_KEYWORDS].some((kw) => label.toLowerCase().includes(kw))) {
          break
        }
        if (
          isNumeric(nextCell) ||
          (isFormula(nextCell) && !String(nextCell.formula ?? '').toUpperCase().includes('SUM'))
        ) {
          missingBelow.push(r)
        }
      }
    }

    if (missingBelow.length > 0) {
      return createIssue(this, {
        message: `SUM 范围可能不完整：${colStart}${rowStart}:${colEnd}${rowEnd} 下方第 ${missingBelow[0]} 行有数据未被包含`,
        cellAddress: cell.address,
        sheetName: context.name,
        formula: cell.formula,
        confidence: ConfidenceLevel.MEDIUM,
        suggestion: '检查是否需要扩展 SUM 范围以包含更多数据',
        details: {
          original_range: `${colStart}${rowStart}:${colEnd}${rowEnd}`,
          potential_missing_rows: missingBelow,
        },
      })
    }

    return null
  },
}

// ── TypeMismatchRule ─────────────────────────────────────────────────

export const TypeMismatchRule: BaseRule = {
  ruleId: 'TYPE_MISMATCH',
  ruleName: '类型不匹配检测',
  issueType: IssueType.TYPE_MISMATCH,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测 VLOOKUP 等函数中的类型不匹配问题',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    const formula = cell.formula!.toUpperCase()

    const lookupMatch = formula.match(
      /([VH]LOOKUP)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,/,
    )
    if (!lookupMatch) return null

    const funcName = lookupMatch[1]
    const lookupValueRef = lookupMatch[2].trim()
    const lookupRangeRef = lookupMatch[3].trim()

    // Get lookup value type (support $A$1 format)
    const cleanLookupRef = lookupValueRef.replace(/\$/g, '')
    const lookupCell = /^[A-Z]+\d+$/.test(cleanLookupRef)
      ? getCell(context, cleanLookupRef)
      : undefined

    if (lookupCell) {
      const lookupType = lookupCell.dataType

      // Get target column type (first column of range)
      const cleanRangeRef = lookupRangeRef.replace(/\$/g, '')
      const rangeMatch = cleanRangeRef.match(/^([A-Z]+)\d+:([A-Z]+)\d+$/)
      if (rangeMatch) {
        const firstCol = columnToNumber(rangeMatch[1])
        const targetColType = getColumnType(context, firstCol)

        if (lookupType !== targetColType) {
          if (
            (lookupType === 'text' && targetColType === 'number') ||
            (lookupType === 'number' && targetColType === 'text')
          ) {
            return createIssue(this, {
              message: `类型不匹配：${funcName} 查找值为 ${lookupType}，目标列为 ${targetColType}`,
              cellAddress: cell.address,
              sheetName: context.name,
              formula: cell.formula,
              confidence: ConfidenceLevel.HIGH,
              suggestion:
                '统一数据类型：使用 VALUE() 将文本转数字，或用 TEXT() 将数字转文本',
              details: {
                lookup_value_ref: lookupValueRef,
                lookup_type: lookupType,
                target_type: targetColType,
              },
            })
          }
        }
      }
    }

    return null
  },
}

// Register rules
RuleRegistry.register(CircularReferenceRule)
RuleRegistry.register(FunctionSpellingRule)
RuleRegistry.register(SumRangeRule)
RuleRegistry.register(TypeMismatchRule)
