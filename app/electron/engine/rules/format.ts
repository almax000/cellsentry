/**
 * Format Rules — ported from src/rules/format_rules.py
 *
 * - DateAmbiguityRule (check_excel)
 * - PercentageFormatRule (check_excel)
 * - UnitConsistencyRule (check_excel)
 */

import {
  BaseRule,
  ConfidenceLevel,
  IssueType,
  createIssue,
  isFormula,
  isNumeric,
} from '../types'
import { RuleRegistry } from '../registry'
import { msg } from '../locale'

// ── DateAmbiguityRule ────────────────────────────────────────────────

const DATE_FORMAT_PATTERNS = [
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,       // MM/DD/YYYY or DD/MM/YYYY
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,         // MM-DD-YYYY or DD-MM-YYYY
  /^\d{4}-\d{1,2}-\d{1,2}$/,           // YYYY-MM-DD (ISO)
  /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,       // DD.MM.YYYY (German/Italian)
  /^\d{4}年\d{1,2}月\d{1,2}日$/,       // YYYY年M月D日 (Japanese)
]

export const DateAmbiguityRule: BaseRule = {
  ruleId: 'DATE_AMBIGUITY',
  ruleName: '日期格式歧义检测',
  issueType: IssueType.DATE_AMBIGUITY,
  defaultConfidence: ConfidenceLevel.MEDIUM,
  description: '检测日期格式歧义和文本型日期问题',
  supportsExcel: true,

  checkExcel(cell, context) {
    // Check text-formatted dates
    if (cell.dataType === 'text' && cell.value) {
      const valueStr = String(cell.value)

      for (const pattern of DATE_FORMAT_PATTERNS) {
        if (pattern.test(valueStr)) {
          return createIssue(this, {
            message: msg(`Text-as-date: cell ${cell.address} contains a date stored as text, date functions may not calculate correctly`, `文本型日期：单元格 ${cell.address} 包含文本格式的日期，日期函数可能无法正确计算`),
            cellAddress: cell.address,
            sheetName: context.name,
            confidence: ConfidenceLevel.HIGH,
            currentValue: valueStr,
            suggestion: msg(
              'Convert text to date:\n1. Use =DATEVALUE(A1)\n2. Or select → Data → Text to Columns → choose date format',
              '将文本转换为日期：\n1. 使用 =DATEVALUE(A1) 转换\n2. 或选中 → 数据 → 分列 → 选择日期格式',
            ),
            details: { data_type: 'text', looks_like_date: true },
          })
        }
      }
    }

    // Check date ambiguity (e.g. 03/04/2024)
    if (cell.dataType === 'date' || (cell.dataType === 'text' && cell.value)) {
      const valueStr = cell.value ? String(cell.value) : ''

      const ambiguousMatch = valueStr.match(
        /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/,
      )
      if (ambiguousMatch) {
        const firstNum = parseInt(ambiguousMatch[1], 10)
        const secondNum = parseInt(ambiguousMatch[2], 10)

        if (firstNum <= 12 && secondNum <= 12 && firstNum !== secondNum) {
          return createIssue(this, {
            message: msg(`Ambiguous date: ${valueStr} could be month ${firstNum} day ${secondNum} or month ${secondNum} day ${firstNum}`, `日期格式歧义：${valueStr} 可能被解释为 ${firstNum}月${secondNum}日 或 ${secondNum}月${firstNum}日`),
            cellAddress: cell.address,
            sheetName: context.name,
            confidence: ConfidenceLevel.MEDIUM,
            currentValue: valueStr,
            suggestion: msg('Use unambiguous date format like YYYY-MM-DD or full month names', '建议使用明确的日期格式如 YYYY-MM-DD 或显示完整月份名称'),
            details: {
              possible_interpretations: [
                `${firstNum}月${secondNum}日`,
                `${secondNum}月${firstNum}日`,
              ],
            },
          })
        }
      }
    }

    return null
  },
}

// ── PercentageFormatRule ─────────────────────────────────────────────

export const PercentageFormatRule: BaseRule = {
  ruleId: 'PERCENTAGE_FORMAT',
  ruleName: '百分比格式检测',
  issueType: IssueType.PERCENTAGE_FORMAT,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测百分比格式的重复转换问题',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isFormula(cell)) return null

    // Check if format is percentage
    if (cell.numberFormat && String(cell.numberFormat).includes('%')) {
      const formula = cell.formula!

      // Check if formula already multiplies by 100
      if (formula.includes('*100') || formula.includes('* 100')) {
        return createIssue(this, {
          message: msg(`Double percentage: ${cell.address} formula multiplies by 100, but cell format is also percentage`, `百分比重复转换：${cell.address} 公式中已乘以100，但单元格格式也设置为百分比`),
          cellAddress: cell.address,
          sheetName: context.name,
          formula,
          confidence: ConfidenceLevel.HIGH,
          suggestion: msg("Remove '*100' from the formula and keep percentage format, or remove percentage format and keep *100", "移除公式中的'*100'，保留百分比格式即可。或移除百分比格式，保留*100"),
          details: { has_multiply_100: true, has_percent_format: true },
        })
      }
    }

    return null
  },
}

// ── UnitConsistencyRule ──────────────────────────────────────────────

const MAGNITUDE_THRESHOLD = 100

export const UnitConsistencyRule: BaseRule = {
  ruleId: 'UNIT_INCONSISTENCY',
  ruleName: '单位一致性检测',
  issueType: IssueType.UNIT_INCONSISTENCY,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测单位不一致导致的计算错误',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (!isNumeric(cell)) return null

    const cellValue = cell.value as number
    if (cellValue === 0) return null

    // Collect other numeric values in the same column
    const colValues: number[] = []
    for (const otherCell of Object.values(context.cells)) {
      if (otherCell.column === cell.column && isNumeric(otherCell)) {
        const v = otherCell.value as number
        if (v && v !== 0) colValues.push(Math.abs(v))
      }
    }

    if (colValues.length < 3) return null

    // Calculate median
    const sorted = [...colValues].sort((a, b) => a - b)
    const medianValue = sorted[Math.floor(sorted.length / 2)]

    const absCellValue = Math.abs(cellValue)
    if (medianValue > 0) {
      const ratio = absCellValue / medianValue
      if (ratio > MAGNITUDE_THRESHOLD || ratio < 1 / MAGNITUDE_THRESHOLD) {
        return createIssue(this, {
          message: msg(`Magnitude outlier: cell ${cell.address} value (${cellValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}) differs significantly from other values in this column`, `数量级异常：单元格 ${cell.address} 的值 (${cellValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}) 与同列其他值的数量级不一致`),
          cellAddress: cell.address,
          sheetName: context.name,
          confidence: ConfidenceLevel.MEDIUM,
          suggestion: msg('Check for unit inconsistency (e.g. mixing thousands with actuals) or data entry error', '检查是否存在单位不一致（如万元与元混合），或数据输入错误'),
          details: {
            cell_value: cellValue,
            median_value: medianValue,
            ratio,
          },
        })
      }
    }

    return null
  },
}

// Register rules
RuleRegistry.register(DateAmbiguityRule)
RuleRegistry.register(PercentageFormatRule)
RuleRegistry.register(UnitConsistencyRule)
