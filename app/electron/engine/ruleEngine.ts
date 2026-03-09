/**
 * Rule engine orchestrator — wires ExcelJS reader to registered rules.
 *
 * Replaces src/rule_engine.py UnifiedRuleEngine.analyze_excel() and
 * the issue-to-renderer mapping from src/sidecar_server.py.
 */

import { readWorkbook } from './excelReader'
import { RuleRegistry } from './registry'
import { EngineIssue, SheetContext, IssueType, ConfidenceLevel } from './types'
import './rules' // triggers rule registration

export interface RendererIssue {
  id: string
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  message: string
  cell: string
  sheet: string
  formula: string | null
  category: string
  layer: string
  suggestion: string
  confidence: string
  currentValue: unknown
  expectedValue: unknown
  correctFormula: string | null
}

function issueTypeToCategory(type: IssueType): string {
  switch (type) {
    case IssueType.CIRCULAR_REFERENCE:
    case IssueType.FUNCTION_SPELLING:
    case IssueType.SUM_RANGE_INCOMPLETE:
    case IssueType.TYPE_MISMATCH:
      return 'Formula'
    case IssueType.HIDDEN_CHARS:
    case IssueType.TEXT_NUMBER:
      return 'Data Type'
    case IssueType.BALANCE_SHEET_IMBALANCE:
    case IssueType.CASHFLOW_IMBALANCE:
    case IssueType.PROFIT_BALANCE_ERROR:
      return 'Balance'
    case IssueType.DATE_AMBIGUITY:
    case IssueType.PERCENTAGE_FORMAT:
    case IssueType.UNIT_INCONSISTENCY:
      return 'Format'
    case IssueType.EXTERNAL_REF_INVALID:
    case IssueType.PIVOT_DATASOURCE:
      return 'Reference'
    case IssueType.HARDCODED_SUMMARY:
      return 'Consistency'
    default:
      return 'Other'
  }
}

function confidenceToSeverity(c: ConfidenceLevel): 'error' | 'warning' | 'info' {
  switch (c) {
    case ConfidenceLevel.HIGH:
      return 'error'
    case ConfidenceLevel.MEDIUM:
      return 'warning'
    case ConfidenceLevel.LOW:
      return 'info'
  }
}

function mapToRendererIssue(issue: EngineIssue, index: number): RendererIssue {
  return {
    id: `issue-${index}`,
    ruleId: issue.ruleId,
    severity: confidenceToSeverity(issue.confidence),
    message: issue.message,
    cell: issue.cellAddress || '',
    sheet: issue.sheetName || '',
    formula: issue.formula,
    category: issueTypeToCategory(issue.issueType),
    layer: 'rule',
    suggestion: issue.suggestion,
    confidence: issue.confidence,
    currentValue: issue.currentValue,
    expectedValue: issue.expectedValue,
    correctFormula: issue.correctFormula,
  }
}

export async function analyzeExcel(
  filePath: string,
): Promise<{
  issues: RendererIssue[]
  summary: { total: number; error: number; warning: number; info: number }
  sheets: string[]
}> {
  const { sheets } = await readWorkbook(filePath)
  const excelRules = RuleRegistry.getExcelRules()
  const sheetRules = RuleRegistry.getSheetRules()
  const engineIssues: EngineIssue[] = []

  for (const context of sheets) {
    // Per-cell rules
    for (const cell of Object.values(context.cells)) {
      for (const rule of excelRules) {
        if (rule.checkExcel) {
          const issue = rule.checkExcel(cell, context)
          if (issue) {
            if (!issue.sheetName) issue.sheetName = context.name
            engineIssues.push(issue)
          }
        }
      }
    }

    // Sheet-level rules
    for (const rule of sheetRules) {
      if (rule.checkSheet) {
        const sheetIssues = rule.checkSheet(context)
        engineIssues.push(...sheetIssues)
      }
    }
  }

  const rendererIssues = engineIssues.map((issue, i) => mapToRendererIssue(issue, i))

  const summary = {
    total: rendererIssues.length,
    error: rendererIssues.filter((i) => i.severity === 'error').length,
    warning: rendererIssues.filter((i) => i.severity === 'warning').length,
    info: rendererIssues.filter((i) => i.severity === 'info').length,
  }

  return {
    issues: rendererIssues,
    summary,
    sheets: sheets.map((s) => s.name),
  }
}
