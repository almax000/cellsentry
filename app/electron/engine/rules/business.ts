/**
 * Business Rules — ported from src/rules/business_rules.py
 *
 * Sheet-level rules (check_sheet):
 * - MarginMissingDivRule
 * - RatioMissingDivRule
 * - DoublePercentageRule
 * - HardcodedSummaryRule
 * - HardcodedFormulaColRule
 * - FormulaColInconsistencyRule
 */

import {
  BaseRule,
  ConfidenceLevel,
  EngineIssue,
  IssueType,
  SheetContext,
  createIssue,
  getCellByRC,
  getRowLabel,
  isFormula,
  isNumeric,
} from '../types'
import { getColumnLetter } from '../utils'
import { msg } from '../locale'
import {
  MARGIN_KEYWORDS,
  NON_FORMULA_KEYWORDS,
  RATIO_ROW_KEYWORDS,
  RATIO_ROW_PATTERNS,
  SKIP_HEADERS,
  SUMMARY_KEYWORDS,
} from '../keywords'

function hasDivision(formula: string): boolean {
  if (!formula) return false
  return formula.includes('/') || formula.toUpperCase().includes('DIVIDE')
}

// ── MarginMissingDivRule ─────────────────────────────────────────────

export const MarginMissingDivRule: BaseRule = {
  ruleId: 'MARGIN_MISSING_DIV',
  ruleName: '利润率缺少除法',
  issueType: IssueType.PERCENTAGE_FORMAT,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测利润率/毛利率等指标是否缺少除法运算',
  supportsExcel: false,

  checkSheet(context) {
    const issues: EngineIssue[] = []

    // Strategy 1: Row labels in column A → check column B
    for (let row = 1; row <= context.maxRow; row++) {
      const labelCell = getCellByRC(context, row, 1)
      if (!labelCell?.value) continue
      const label = String(labelCell.value).trim().toLowerCase()
      if (![...MARGIN_KEYWORDS].some((kw) => label.includes(kw))) continue

      const valueCell = getCellByRC(context, row, 2)
      if (valueCell && isFormula(valueCell) && !hasDivision(valueCell.formula!)) {
        issues.push(
          createIssue(this, {
            message: msg(`'${labelCell.value}' should be a ratio metric, but formula is missing division`, `'${labelCell.value}' 应该是比率指标，但公式中缺少除法运算`),
            cellAddress: `B${row}`,
            sheetName: context.name,
            formula: valueCell.formula,
            suggestion: msg('Ratio formulas should include division, e.g.: =GrossProfit/Revenue', '比率指标公式应包含除法，例如: =毛利润/营业收入'),
            currentValue: valueCell.formula,
          }),
        )
      }
    }

    // Strategy 2: Column headers in row 1 → check data rows below
    for (let col = 2; col < Math.min(context.maxColumn + 1, 20); col++) {
      const headerCell = getCellByRC(context, 1, col)
      if (!headerCell?.value) continue
      const header = String(headerCell.value).trim().toLowerCase()
      if (![...MARGIN_KEYWORDS].some((kw) => header.includes(kw))) continue

      const colLetter = getColumnLetter(col)
      let formulasWithDiv = 0
      const formulasWithoutDiv: [number, string][] = []

      for (let row = 2; row <= context.maxRow; row++) {
        const cell = getCellByRC(context, row, col)
        if (cell && isFormula(cell)) {
          if (hasDivision(cell.formula!)) {
            formulasWithDiv++
          } else {
            formulasWithoutDiv.push([row, cell.formula!])
          }
        }
      }

      if (formulasWithDiv > 0 && formulasWithoutDiv.length > 0) {
        for (const [row, formula] of formulasWithoutDiv) {
          issues.push(
            createIssue(this, {
              message: msg(`'${headerCell.value}' column: this row's formula is missing division (other rows have it)`, `'${headerCell.value}' 列中此行公式缺少除法（同列其他行有除法）`),
              cellAddress: `${colLetter}${row}`,
              sheetName: context.name,
              formula,
              currentValue: formula,
              suggestion: msg('Ratio formulas should include division, e.g.: =GrossProfit/Revenue', '比率指标公式应包含除法，例如: =毛利润/营业收入'),
            }),
          )
        }
      } else if (formulasWithDiv === 0 && formulasWithoutDiv.length > 0) {
        for (const [row, formula] of formulasWithoutDiv) {
          issues.push(
            createIssue(this, {
              message: msg(`'${headerCell.value}' should be a ratio metric, but formula is missing division`, `'${headerCell.value}' 应该是比率指标，但公式中缺少除法运算`),
              cellAddress: `${colLetter}${row}`,
              sheetName: context.name,
              formula,
              currentValue: formula,
              suggestion: msg('Ratio formulas should include division, e.g.: =GrossProfit/Revenue', '比率指标公式应包含除法，例如: =毛利润/营业收入'),
            }),
          )
        }
      }
    }

    return issues
  },
}

// ── RatioMissingDivRule ──────────────────────────────────────────────

export const RatioMissingDivRule: BaseRule = {
  ruleId: 'RATIO_MISSING_DIV',
  ruleName: '占比缺少除法',
  issueType: IssueType.PERCENTAGE_FORMAT,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测占比/比例类指标是否缺少除法运算',
  supportsExcel: false,

  checkSheet(context) {
    const issues: EngineIssue[] = []

    for (let row = 1; row <= context.maxRow; row++) {
      const labelCell = getCellByRC(context, row, 1)
      if (!labelCell?.value) continue
      const label = String(labelCell.value).trim()
      const labelLower = label.toLowerCase()

      const hasKeyword = RATIO_ROW_KEYWORDS.some((kw) => labelLower.includes(kw))
      const hasPattern =
        !hasKeyword &&
        RATIO_ROW_PATTERNS.some((p) => new RegExp(p, 'i').test(label))

      if (!hasKeyword && !hasPattern) continue

      const valueCell = getCellByRC(context, row, 2)
      if (valueCell && isFormula(valueCell) && !hasDivision(valueCell.formula!)) {
        issues.push(
          createIssue(this, {
            message: msg(`'${labelCell.value}' represents a ratio, but formula is missing division`, `'${labelCell.value}' 表示占比，但公式中缺少除法运算`),
            cellAddress: `B${row}`,
            sheetName: context.name,
            formula: valueCell.formula,
            currentValue: valueCell.formula,
            suggestion: msg('Ratio formulas should include division, e.g.: =Expense/Revenue', '占比指标公式应包含除法，例如: =费用/收入'),
          }),
        )
      }
    }

    return issues
  },
}

// ── DoublePercentageRule ─────────────────────────────────────────────

export const DoublePercentageRule: BaseRule = {
  ruleId: 'DOUBLE_PERCENTAGE',
  ruleName: '百分比重复转换',
  issueType: IssueType.PERCENTAGE_FORMAT,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测公式*100且单元格格式为百分比的双重转换',
  supportsExcel: false,

  checkSheet(context) {
    const issues: EngineIssue[] = []

    for (const cell of Object.values(context.cells)) {
      if (!isFormula(cell)) continue
      if (cell.numberFormat && String(cell.numberFormat).includes('%')) {
        if (cell.formula!.includes('*100') || cell.formula!.includes('* 100')) {
          issues.push(
            createIssue(this, {
              message: msg('Formula multiplies by 100 but cell format is also percentage — displayed value is inflated 100x', '公式中已乘以100，但单元格格式也设置为百分比，导致显示值放大100倍'),
              cellAddress: cell.address,
              sheetName: context.name,
              formula: cell.formula,
              currentValue: cell.formula,
              suggestion: msg("Remove '*100' from the formula and keep percentage format", "移除公式中的'*100'，保留百分比格式即可"),
            }),
          )
        }
      }
    }

    return issues
  },
}

// ── HardcodedSummaryRule ─────────────────────────────────────────────

export const HardcodedSummaryRule: BaseRule = {
  ruleId: 'HARDCODED_SUMMARY',
  ruleName: '汇总行硬编码',
  issueType: IssueType.HARDCODED_SUMMARY,
  defaultConfidence: ConfidenceLevel.MEDIUM,
  description: '检测汇总行是否使用硬编码值而非公式',
  supportsExcel: false,

  checkSheet(context) {
    const issues: EngineIssue[] = []

    // Detect row-number columns
    const rowNumberColumns = new Set<number>()
    for (let col = 2; col < Math.min(context.maxColumn + 1, 5); col++) {
      const values: number[] = []
      let isRowNumCol = true
      for (let row = 1; row < Math.min(context.maxRow + 1, 20); row++) {
        const cell = getCellByRC(context, row, col)
        if (cell && isNumeric(cell)) {
          const v = cell.value as number
          if (typeof v === 'number' && v === Math.floor(v)) {
            values.push(v)
          } else {
            isRowNumCol = false
            break
          }
        } else if (cell?.value != null) {
          isRowNumCol = false
          break
        }
      }

      if (isRowNumCol && values.length >= 5) {
        const sorted = [...values].sort((a, b) => a - b)
        if (sorted[0] >= 0 && sorted[sorted.length - 1] <= 200) {
          const diffs = []
          for (let i = 0; i < Math.min(5, sorted.length - 1); i++) {
            diffs.push(sorted[i + 1] - sorted[i])
          }
          if (diffs.every((d) => d === 1)) {
            rowNumberColumns.add(col)
          }
        }
      }
    }

    for (let row = 1; row <= context.maxRow; row++) {
      const labelCell = getCellByRC(context, row, 1)
      if (!labelCell?.value) continue
      const label = String(labelCell.value).trim().toLowerCase()
      if (![...SUMMARY_KEYWORDS].some((kw) => label.includes(kw))) continue

      // Check if row already has formula columns
      let rowHasFormula = false
      for (let checkCol = 2; checkCol < Math.min(context.maxColumn + 1, 15); checkCol++) {
        const c = getCellByRC(context, row, checkCol)
        if (c && isFormula(c)) {
          rowHasFormula = true
          break
        }
      }

      for (let col = 2; col < Math.min(context.maxColumn + 1, 10); col++) {
        if (rowNumberColumns.has(col)) continue

        const valueCell = getCellByRC(context, row, col)
        if (!valueCell?.value) continue
        if (!isNumeric(valueCell)) continue

        const v = valueCell.value as number
        // Skip small integers
        if (typeof v === 'number' && v === Math.floor(v) && v >= 0 && v <= 100)
          continue
        // Skip if row already has formulas (ERP/merged report)
        if (rowHasFormula) continue

        // Check if there's data above to sum
        let hasDataAbove = false
        for (let checkRow = row - 1; checkRow > 0; checkRow--) {
          const checkCell = getCellByRC(context, checkRow, col)
          if (checkCell && isNumeric(checkCell)) {
            hasDataAbove = true
            break
          }
          const checkLabel = getRowLabel(context, checkRow)
          if (
            checkLabel &&
            [...SUMMARY_KEYWORDS].some((kw) => checkLabel.toLowerCase().includes(kw))
          ) {
            break
          }
        }

        if (hasDataAbove) {
          issues.push(
            createIssue(this, {
              message: msg(`Summary row '${labelCell.value}' uses a hardcoded value instead of a formula`, `汇总行 '${labelCell.value}' 使用了硬编码值而非公式`),
              cellAddress: `${getColumnLetter(col)}${row}`,
              sheetName: context.name,
              currentValue: v,
              suggestion: msg('Consider using a SUM formula to aggregate the data above', '建议使用SUM公式汇总上方数据'),
            }),
          )
        }
      }
    }

    return issues
  },
}

// ── HardcodedFormulaColRule ──────────────────────────────────────────

export const HardcodedFormulaColRule: BaseRule = {
  ruleId: 'HARDCODED_IN_FORMULA_COL',
  ruleName: '公式列中硬编码',
  issueType: IssueType.HARDCODED_SUMMARY,
  defaultConfidence: ConfidenceLevel.MEDIUM,
  description: '检测公式列中的硬编码数值',
  supportsExcel: false,

  checkSheet(context) {
    const issues: EngineIssue[] = []
    if (context.maxRow < 3) return issues

    const headerRow = 1

    for (let col = 2; col < Math.min(context.maxColumn + 1, 15); col++) {
      // Skip non-formula header columns
      const headerCell = getCellByRC(context, headerRow, col)
      if (headerCell?.value && typeof headerCell.value === 'string') {
        const headerLower = headerCell.value.trim().toLowerCase()
        if ([...SKIP_HEADERS].some((kw) => headerLower.includes(kw))) continue
      }

      let formulaCount = 0
      let numericCount = 0
      const hardcodedRows: number[] = []

      let dataStart = headerRow + 1
      // Handle double-header sheets
      const startCell = getCellByRC(context, dataStart, col)
      if (startCell?.value && typeof startCell.value === 'string') {
        const firstVal = String(startCell.value).trim().toLowerCase()
        if (firstVal && !firstVal.startsWith('=')) {
          if ([...NON_FORMULA_KEYWORDS].some((kw) => firstVal.includes(kw))) {
            dataStart++
          }
        }
      }

      for (let row = dataStart; row <= context.maxRow; row++) {
        const cell = getCellByRC(context, row, col)
        if (!cell?.value) continue
        if (isFormula(cell)) {
          formulaCount++
        } else if (isNumeric(cell)) {
          numericCount++
          hardcodedRows.push(row)
        }
      }

      const total = formulaCount + numericCount
      if (total < 3) continue

      const formulaRatio = formulaCount / total
      if (formulaRatio >= 0.7 && hardcodedRows.length > 0) {
        const colLetter = getColumnLetter(col)
        for (const row of hardcodedRows) {
          const cell = getCellByRC(context, row, col)
          const val = cell?.value as number | undefined
          // Skip small integers
          if (
            typeof val === 'number' &&
            val === Math.floor(val) &&
            val >= 0 &&
            val <= 100
          )
            continue
          issues.push(
            createIssue(this, {
              message: msg(`${Math.round(formulaRatio * 100)}% of cells in this column use formulas, but ${colLetter}${row} is a hardcoded value`, `此列 ${Math.round(formulaRatio * 100)}% 的单元格使用公式，但 ${colLetter}${row} 是硬编码数值`),
              cellAddress: `${colLetter}${row}`,
              sheetName: context.name,
              currentValue: val,
              suggestion: msg('Consider using a formula instead (e.g. referencing prior balance or other cells)', '建议改用公式（如引用上期余额或其他单元格）'),
            }),
          )
        }
      }
    }

    return issues
  },
}

// ── FormulaColInconsistencyRule ──────────────────────────────────────

export const FormulaColInconsistencyRule: BaseRule = {
  ruleId: 'FORMULA_COL_INCONSISTENCY',
  ruleName: '公式引用不一致',
  issueType: IssueType.UNKNOWN,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测同列公式中引用列的不一致',
  supportsExcel: false,

  checkSheet(context) {
    const issues: EngineIssue[] = []
    if (context.maxRow < 3) return issues

    for (let col = 2; col < Math.min(context.maxColumn + 1, 15); col++) {
      const formulas: [number, string, Set<string>][] = []

      for (let row = 2; row <= context.maxRow; row++) {
        const cell = getCellByRC(context, row, col)
        if (cell && isFormula(cell)) {
          const refCols = new Set(
            [...cell.formula!.matchAll(/([A-Z]+)\d+/g)].map((m) => m[1]),
          )
          formulas.push([row, cell.formula!, refCols])
        }
      }

      if (formulas.length < 3) continue

      // Count pattern frequencies
      const patternCounts = new Map<string, number>()
      for (const [, , refs] of formulas) {
        const key = [...refs].sort().join(',')
        patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1)
      }

      // Find most common pattern
      let mostCommonKey = ''
      let mostCommonCount = 0
      for (const [key, count] of patternCounts) {
        if (count > mostCommonCount) {
          mostCommonCount = count
          mostCommonKey = key
        }
      }

      if (mostCommonCount / formulas.length < 0.7) continue

      const mostCommonPattern = new Set(
        mostCommonKey ? mostCommonKey.split(',') : [],
      )
      const colLetter = getColumnLetter(col)

      for (const [row, formula, refs] of formulas) {
        const refsKey = [...refs].sort().join(',')
        if (refsKey !== mostCommonKey) {
          const diff = [...refs].filter((r) => !mostCommonPattern.has(r))
          const unexpected =
            diff.length > 0 ? diff.sort().join(', ') : 'different structure'
          const expectedCols = [...mostCommonPattern].sort().join(', ')
          issues.push(
            createIssue(this, {
              message: msg(`Other formulas in this column reference columns ${expectedCols}, but this row references different columns (${unexpected})`, `同列其他公式引用列 ${expectedCols}，但此行引用了不同的列 (${unexpected})`),
              cellAddress: `${colLetter}${row}`,
              sheetName: context.name,
              formula,
              currentValue: formula,
              suggestion: msg(`Check if this formula should reference columns ${expectedCols}`, `检查是否应该引用列 ${expectedCols}`),
            }),
          )
        }
      }
    }

    return issues
  },
}
