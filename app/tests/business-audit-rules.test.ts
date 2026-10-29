import { describe, expect, it } from 'vitest'
import { buildAuditEvidence } from '../electron/engine/auditEvidence'
import { analyzeExcelFromSheets } from '../electron/engine/ruleEngine'
import { ConfidenceLevel, IssueType, type CellInfo, type EngineIssue, type SheetContext } from '../electron/engine/types'

type Value = unknown | { formula: string; cached: unknown }

function column(address: string): number {
  const letters = address.match(/^[A-Z]+/)?.[0]
  if (!letters) throw new Error(`Invalid address ${address}`)
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)
}

function row(address: string): number {
  const value = Number(address.match(/\d+$/)?.[0])
  if (!value) throw new Error(`Invalid address ${address}`)
  return value
}

function businessSheet(name: string, entries: Record<string, Value>): SheetContext {
  const cells: Record<string, CellInfo> = {}
  for (const [address, entry] of Object.entries(entries)) {
    const calculated = typeof entry === 'object' && entry !== null && 'formula' in entry
    const value = calculated ? entry.cached : entry
    cells[address] = {
      address, row: row(address), column: column(address), value,
      formula: calculated ? entry.formula : null,
      dataType: calculated ? 'formula' : typeof value === 'number' ? 'number' : 'text',
      numberFormat: null, isMerged: false,
      lenVisible: String(value ?? '').length, lenActual: String(value ?? '').length, hasHiddenChars: false,
    }
  }
  const headers: Record<number, string> = {}
  const rowLabels: Record<number, string> = {}
  for (const cell of Object.values(cells)) {
    if (cell.row === 1 && typeof cell.value === 'string') headers[cell.column] = cell.value
    if (cell.column === 1 && typeof cell.value === 'string') rowLabels[cell.row] = cell.value
  }
  return {
    name, cells, maxRow: Math.max(...Object.values(cells).map((cell) => cell.row)),
    maxColumn: Math.max(...Object.values(cells).map((cell) => cell.column)),
    mergedRanges: [], headers, rowLabels, reportType: null,
  }
}

const formula = (text: string, cached: unknown): { formula: string; cached: unknown } => ({ formula: text, cached })

describe('business audit regressions', () => {
  it('does not compare unrelated KPI units, but flags a monthly USD entry that is three orders of magnitude below its same-unit peers', async () => {
    const result = await analyzeExcelFromSheets([businessSheet('Operating dashboard', {
      A1: 'Metric', B1: 'Value', C1: 'Unit',
      A2: 'Revenue', B2: 1_200_000, C2: 'USD',
      A3: 'Gross margin', B3: 0.38, C3: '%',
      A4: 'Headcount', B4: 42, C4: 'people',
      A5: 'Collection period', B5: 47, C5: 'days',
      A7: 'Month', B7: 'Revenue', C7: 'Unit',
      A8: 'January', B8: 82_000, C8: 'USD',
      A9: 'February', B9: 91_000, C9: 'USD',
      A10: 'March', B10: 87_000, C10: 'USD',
      A11: 'April', B11: 87, C11: 'USD',
    })])
    const unitIssues = result.issues.filter((issue) => issue.ruleId === 'UNIT_INCONSISTENCY')

    expect(unitIssues.map((issue) => issue.cell)).toEqual(['B11'])
    expect(unitIssues[0]?.currentValue).toBe(87)
  })

  it('recognizes Chinese unit headers and labels before comparing the revenue values', async () => {
    const result = await analyzeExcelFromSheets([businessSheet('经营看板', {
      A1: '指标', B1: '数值', C1: '单位',
      A2: '收入', B2: 1_200_000, C2: '元',
      A3: '毛利率', B3: 0.38, C3: '%',
      A4: '人数', B4: 42, C4: '人',
      A5: '回款天数', B5: 47, C5: '天',
      A7: '月份', B7: '收入', C7: '单位',
      A8: '一月', B8: 82_000, C8: '元',
      A9: '二月', B9: 91_000, C9: '元',
      A10: '三月', B10: 87_000, C10: '元',
      A11: '四月', B11: 87, C11: '元',
    })])

    expect(result.issues.filter((issue) => issue.ruleId === 'UNIT_INCONSISTENCY').map((issue) => issue.cell)).toEqual(['B11'])
  })

  it('does not fall back to a mixed distribution when an explicit unit column has sparse declarations', async () => {
    const result = await analyzeExcelFromSheets([businessSheet('Sparse dashboard', {
      A1: 'Metric', B1: 'Value', C1: 'Unit',
      A2: 'Revenue', B2: 1_200_000, C2: 'USD',
      A3: 'Gross margin', B3: 0.38, C3: '%',
      A4: 'Headcount', B4: 42,
    })])

    expect(result.issues.filter((issue) => issue.ruleId === 'UNIT_INCONSISTENCY')).toEqual([])
  })

  it('treats custom UOM text as opaque labels after an explicit UOM header, without attempting unit conversion', async () => {
    const result = await analyzeExcelFromSheets([businessSheet('Physical KPIs', {
      A1: 'Metric', B1: 'Value', C1: 'UOM',
      A2: 'Surface density', B2: 1_200_000, C2: 'kg/m²',
      A3: 'Flow speed', B3: 0.38, C3: 'm/s',
      A4: 'Carbon intensity', B4: 42, C4: 'kg CO2e',
    })])

    expect(result.issues.filter((issue) => issue.ruleId === 'UNIT_INCONSISTENCY')).toEqual([])
  })

  it('does not treat neighbouring customer names as a unit column and keeps the legacy same-column outlier check', async () => {
    const result = await analyzeExcelFromSheets([businessSheet('Invoice register', {
      A1: 'Invoice', B1: 'Invoice total (USD)', C1: 'Customer',
      A2: 'INV-100', B2: 1_000, C2: 'Acme',
      A3: 'INV-101', B3: 1_000, C3: 'Beta',
      A4: 'INV-102', B4: 1, C4: 'Gamma',
    })])

    expect(result.issues.filter((issue) => issue.ruleId === 'UNIT_INCONSISTENCY').map((issue) => issue.cell)).toEqual(['B4'])
  })

  it.each([
    ['收款单位', '甲公司', '乙公司', '丙公司'],
    ['Business unit', 'North', 'South', 'West'],
  ])('does not treat %s as a measurement-unit header', async (header, first, second, third) => {
    const result = await analyzeExcelFromSheets([businessSheet('Invoice register', {
      A1: 'Invoice', B1: 'Invoice total (USD)', C1: header,
      A2: 'INV-100', B2: 1_000, C2: first,
      A3: 'INV-101', B3: 1_000, C3: second,
      A4: 'INV-102', B4: 1, C4: third,
    })])

    expect(result.issues.filter((issue) => issue.ruleId === 'UNIT_INCONSISTENCY').map((issue) => issue.cell)).toEqual(['B4'])
  })

  it('keeps a labeled quarterly total accountable for an omitted final quarter', async () => {
    const result = await analyzeExcelFromSheets([businessSheet('Quarterly revenue', {
      A1: 'Quarter', B1: 'Recognized revenue',
      A2: 'Q1', B2: 120_000,
      A3: 'Q2', B3: 135_000,
      A4: 'Q3', B4: 128_000,
      A5: 'Q4', B5: 142_000,
      A6: 'FY 2026 total', B6: formula('=SUM(B2:B4)', 383_000),
    })])
    const issue = result.issues.find((candidate) => candidate.ruleId === 'SUM_RANGE_INCOMPLETE' && candidate.cell === 'B6')

    expect(issue?.expectedValue).toBe('=SUM(B2:B5)')
    expect(issue?.suggestion).toContain('B5')
  })

  it('keeps observed local divide-by-zero evidence while refusing to guess a cross-sheet numerator', () => {
    const context = businessSheet('Margin', {
      B4: formula('=Revenue!B5/C4', { error: '#DIV/0!' }),
      C4: 0,
      B5: 999_999,
    })
    const issue: EngineIssue = {
      ruleId: 'FORMULA_RUNTIME_ERROR', issueType: IssueType.UNKNOWN,
      message: 'Observed formula error', confidence: ConfidenceLevel.HIGH,
      cellAddress: 'B4', sheetName: 'Margin', formula: '=Revenue!B5/C4',
      currentValue: { error: '#DIV/0!' }, expectedValue: null,
      suggestion: 'Check denominator', correctFormula: null, details: {},
    }
    const evidence = buildAuditEvidence(issue, context)

    expect(evidence).toContain('cached value "#DIV/0!" (not recalculated)')
    expect(evidence).toContain('observed reference "Margin"!C4: value "0"')
    expect(evidence).toContain('cross-sheet references omitted: 1')
    expect(evidence).not.toContain('"Margin"!B5')

    const mixedContext = businessSheet('Margin', {
      B4: formula('=Revenue!B5+B5', 0),
      B5: 999_999,
    })
    const mixedEvidence = buildAuditEvidence({ ...issue, formula: '=Revenue!B5+B5' }, mixedContext)
    expect(mixedEvidence).toContain('observed reference "Margin"!B5: value "999999"')
  })
})
