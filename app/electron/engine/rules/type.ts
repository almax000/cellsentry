/**
 * Type Rules — ported from src/rules/type_rules.py
 *
 * - HiddenCharsRule (check_excel)
 * - TextNumberRule (check_excel)
 */

import {
  BaseRule,
  ConfidenceLevel,
  IssueType,
  createIssue,
  isTextNumber,
} from '../types'
import { RuleRegistry } from '../registry'

// ── HiddenCharsRule ──────────────────────────────────────────────────

const HIDDEN_CHARS = [
  '\t',      // tab
  '\n',      // newline
  '\r',      // carriage return
  '\x00',    // null
  '\xa0',    // non-breaking space
  '\u200b',  // zero-width space
  '\u200c',  // zero-width non-joiner
  '\u200d',  // zero-width joiner
  '\ufeff',  // BOM
]

export const HiddenCharsRule: BaseRule = {
  ruleId: 'HIDDEN_CHARS',
  ruleName: '隐藏字符检测',
  issueType: IssueType.HIDDEN_CHARS,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测单元格中的不可见字符',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (cell.value == null) return null
    if (typeof cell.value !== 'string') return null

    const value = cell.value as string
    const visibleLen = value.trim().length
    const actualLen = value.length

    // Leading/trailing whitespace
    if (visibleLen !== actualLen) {
      return createIssue(this, {
        message: `检测到隐藏字符：单元格 ${cell.address} 包含前后空格或不可见字符`,
        cellAddress: cell.address,
        sheetName: context.name,
        confidence: ConfidenceLevel.HIGH,
        currentValue: JSON.stringify(value),
        expectedValue: JSON.stringify(value.trim()),
        suggestion: '使用 TRIM() 函数清除前后空格，或使用 CLEAN() 函数清除不可打印字符',
        details: {
          actual_len: actualLen,
          visible_len: visibleLen,
          difference: actualLen - visibleLen,
        },
      })
    }

    // Other hidden characters
    for (const char of HIDDEN_CHARS) {
      if (value.includes(char)) {
        return createIssue(this, {
          message: `检测到隐藏字符：单元格 ${cell.address} 包含不可见字符`,
          cellAddress: cell.address,
          sheetName: context.name,
          confidence: ConfidenceLevel.HIGH,
          currentValue: JSON.stringify(value),
          suggestion: '使用 SUBSTITUTE() 或 CLEAN() 函数清除不可见字符',
          details: {
            hidden_char: JSON.stringify(char),
            actual_len: actualLen,
          },
        })
      }
    }

    // CellInfo-level hidden char flags
    if (cell.hasHiddenChars || cell.lenActual !== cell.lenVisible) {
      return createIssue(this, {
        message: `检测到隐藏字符：单元格 ${cell.address} 的实际长度与可见长度不一致`,
        cellAddress: cell.address,
        sheetName: context.name,
        confidence: ConfidenceLevel.HIGH,
        suggestion: '使用 TRIM() 和 CLEAN() 函数清理数据',
        details: {
          len_actual: cell.lenActual,
          len_visible: cell.lenVisible,
        },
      })
    }

    return null
  },
}

// ── TextNumberRule ───────────────────────────────────────────────────

export const TextNumberRule: BaseRule = {
  ruleId: 'TEXT_NUMBER',
  ruleName: '文本型数字检测',
  issueType: IssueType.TEXT_NUMBER,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测存储为文本格式的数字',
  supportsExcel: true,

  checkExcel(cell, context) {
    if (isTextNumber(cell)) {
      return createIssue(this, {
        message: `文本型数字：单元格 ${cell.address} 包含存储为文本的数字`,
        cellAddress: cell.address,
        sheetName: context.name,
        confidence: ConfidenceLevel.HIGH,
        currentValue: cell.value,
        suggestion:
          "将文本转换为数字：\n" +
          '1. 选中单元格 → 数据 → 分列 → 完成\n' +
          '2. 或在旁边输入 =VALUE(A1)\n' +
          "3. 或选中后点击绿色三角选择'转换为数字'",
        details: { data_type: cell.dataType },
      })
    }

    return null
  },
}

// Register rules
RuleRegistry.register(HiddenCharsRule)
RuleRegistry.register(TextNumberRule)
