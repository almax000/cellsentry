/**
 * CellSentry Engine Types
 *
 * Ported from src/rules/base.py core data structures.
 */

import { getColumnLetter } from './utils'

export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum IssueType {
  CIRCULAR_REFERENCE = 'circular_reference',
  FUNCTION_SPELLING = 'function_spelling',
  SUM_RANGE_INCOMPLETE = 'sum_range_incomplete',
  TYPE_MISMATCH = 'type_mismatch',
  HIDDEN_CHARS = 'hidden_chars',
  TEXT_NUMBER = 'text_number',
  BALANCE_SHEET_IMBALANCE = 'balance_sheet_imbalance',
  CASHFLOW_IMBALANCE = 'cashflow_imbalance',
  PROFIT_BALANCE_ERROR = 'profit_balance_error',
  DATE_AMBIGUITY = 'date_ambiguity',
  PERCENTAGE_FORMAT = 'percentage_format',
  UNIT_INCONSISTENCY = 'unit_inconsistency',
  EXTERNAL_REF_INVALID = 'external_ref_invalid',
  PIVOT_DATASOURCE = 'pivot_datasource',
  HARDCODED_SUMMARY = 'hardcoded_summary',
  UNKNOWN = 'unknown',
}

export interface CellInfo {
  address: string
  value: unknown
  formula: string | null
  dataType: string // 'number' | 'text' | 'date' | 'bool' | 'formula' | 'empty'
  numberFormat: string | null
  isMerged: boolean
  row: number
  column: number
  lenVisible: number
  lenActual: number
  hasHiddenChars: boolean
}

export function isFormula(cell: CellInfo): boolean {
  return cell.formula !== null && cell.formula.startsWith('=')
}

export function isNumeric(cell: CellInfo): boolean {
  return (
    cell.dataType === 'number' ||
    (cell.value !== null &&
      cell.value !== undefined &&
      typeof cell.value === 'number')
  )
}

export function isTextNumber(cell: CellInfo): boolean {
  if (cell.dataType !== 'text' || cell.value == null) return false
  const str = String(cell.value).trim()
  if (str === '') return false
  return !isNaN(Number(str))
}

export interface SheetContext {
  name: string
  maxRow: number
  maxColumn: number
  cells: Record<string, CellInfo>
  mergedRanges: string[]
  headers: Record<number, string>   // col -> header text
  rowLabels: Record<number, string> // row -> label text
  reportType: string | null
}

export function getCell(ctx: SheetContext, address: string): CellInfo | undefined {
  return ctx.cells[address.toUpperCase()]
}

export function getCellByRC(
  ctx: SheetContext,
  row: number,
  col: number,
): CellInfo | undefined {
  const address = `${getColumnLetter(col)}${row}`
  return getCell(ctx, address)
}

export function getColumnType(ctx: SheetContext, col: number): string {
  const typesCount: Record<string, number> = {}
  for (const cell of Object.values(ctx.cells)) {
    if (cell.column === col && cell.dataType !== 'empty') {
      typesCount[cell.dataType] = (typesCount[cell.dataType] || 0) + 1
    }
  }
  const entries = Object.entries(typesCount)
  if (entries.length === 0) return 'unknown'
  return entries.reduce((a, b) => (a[1] >= b[1] ? a : b))[0]
}

export function getHeader(ctx: SheetContext, col: number): string | undefined {
  return ctx.headers[col]
}

export function getRowLabel(ctx: SheetContext, row: number): string | undefined {
  return ctx.rowLabels[row]
}

export interface EngineIssue {
  ruleId: string
  issueType: IssueType
  message: string
  confidence: ConfidenceLevel
  cellAddress: string | null
  sheetName: string | null
  formula: string | null
  currentValue: unknown
  expectedValue: unknown
  suggestion: string
  correctFormula: string | null
  details: Record<string, unknown>
}

export interface BaseRule {
  ruleId: string
  ruleName: string
  issueType: IssueType
  defaultConfidence: ConfidenceLevel
  description: string
  supportsExcel: boolean
  checkExcel?: (
    cell: CellInfo,
    context: SheetContext,
    workbookContext?: Record<string, unknown>,
  ) => EngineIssue | null
  checkSheet?: (
    context: SheetContext,
    workbookContext?: Record<string, unknown>,
  ) => EngineIssue[]
}

export function createIssue(
  rule: BaseRule,
  params: Partial<EngineIssue> & { message: string },
): EngineIssue {
  return {
    ruleId: rule.ruleId,
    issueType: rule.issueType,
    message: params.message,
    confidence: params.confidence ?? rule.defaultConfidence,
    cellAddress: params.cellAddress ?? null,
    sheetName: params.sheetName ?? null,
    formula: params.formula ?? null,
    currentValue: params.currentValue ?? null,
    expectedValue: params.expectedValue ?? null,
    suggestion: params.suggestion ?? '',
    correctFormula: params.correctFormula ?? null,
    details: params.details ?? {},
  }
}
