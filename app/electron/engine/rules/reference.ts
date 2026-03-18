/**
 * Reference Rules — ported from src/rules/reference_rules.py
 *
 * - ExternalReferenceRule (check_excel)
 * - PivotDataSourceRule: supports_excel = false, only has check_text → skipped
 */

import {
  BaseRule,
  ConfidenceLevel,
  IssueType,
  createIssue,
  isFormula,
} from '../types'
import { RuleRegistry } from '../registry'
import { msg } from '../locale'

export const ExternalReferenceRule: BaseRule = {
  ruleId: 'EXTERNAL_REF_INVALID',
  ruleName: '外部引用有效性检测',
  issueType: IssueType.EXTERNAL_REF_INVALID,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测外部引用是否有效',
  supportsExcel: true,

  checkExcel(cell, context, workbookContext) {
    if (!isFormula(cell)) return null

    const formula = cell.formula!

    // Check for external workbook reference [Book.xlsx]Sheet!A1
    const externalRefMatch = formula.match(/\[([^\]]+)\]/)
    if (externalRefMatch) {
      const externalFile = externalRefMatch[1]

      if (workbookContext && 'external_links' in workbookContext) {
        const invalidLinks = (workbookContext['invalid_links'] as string[]) ?? []
        if (invalidLinks.includes(externalFile)) {
          return createIssue(this, {
            message: msg(`Invalid external reference: file [${externalFile}] does not exist or has been moved`, `外部引用无效：引用的文件 [${externalFile}] 不存在或已移动`),
            cellAddress: cell.address,
            sheetName: context.name,
            formula,
            confidence: ConfidenceLevel.HIGH,
            suggestion: msg(
              'Solutions:\n1. Check if the referenced file exists at the specified path\n2. Use Edit Links to update the file path\n3. Or copy external data into the current workbook',
              "解决方案：\n1. 检查引用的文件是否存在于指定路径\n2. 使用'编辑链接'功能更新文件路径\n3. 或将外部数据复制到当前工作簿",
            ),
            details: { external_file: externalFile },
          })
        }
      }
    }

    // Check #REF! error
    if (
      cell.value === '#REF!' ||
      (typeof cell.value === 'string' && String(cell.value).includes('#REF!'))
    ) {
      return createIssue(this, {
        message: msg(`Reference error: cell ${cell.address} contains invalid reference #REF!`, `引用错误：单元格 ${cell.address} 包含无效引用 #REF!`),
        cellAddress: cell.address,
        sheetName: context.name,
        formula,
        confidence: ConfidenceLevel.HIGH,
        suggestion: msg('Check whether the cells or ranges referenced by the formula have been deleted', '检查公式引用的单元格或区域是否已被删除'),
        details: { error_type: '#REF!' },
      })
    }

    return null
  },
}

// PivotDataSourceRule: only has check_text (LLM pipeline), no check_excel
const PivotDataSourceRule: BaseRule = {
  ruleId: 'PIVOT_DATASOURCE',
  ruleName: '透视表数据源检测',
  issueType: IssueType.PIVOT_DATASOURCE,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测透视表数据源范围问题',
  supportsExcel: false,
}

// Register rules
RuleRegistry.register(PivotDataSourceRule)
RuleRegistry.register(ExternalReferenceRule)
