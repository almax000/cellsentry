import { describe, expect, it } from 'vitest'
import { buildAuditEvidence, MAX_AUDIT_EVIDENCE_CHARS } from '../electron/engine/auditEvidence'
import { analyzeExcelFromSheets } from '../electron/engine/ruleEngine'
import { ConfidenceLevel, IssueType, type CellInfo, type EngineIssue, type SheetContext } from '../electron/engine/types'

function cell(address: string, row: number, column: number, value: unknown, formula: string | null = null): CellInfo {
  return { address, row, column, value, formula, dataType: formula ? 'formula' : typeof value === 'number' ? 'number' : 'text', numberFormat: null, isMerged: false, lenVisible: String(value ?? '').length, lenActual: String(value ?? '').length, hasHiddenChars: false }
}

function issue(overrides: Partial<EngineIssue> = {}): EngineIssue {
  return { ruleId: 'SUM_RANGE_INCOMPLETE', issueType: IssueType.SUM_RANGE_INCOMPLETE, message: 'generated finding', confidence: ConfidenceLevel.HIGH, cellAddress: 'B5', sheetName: 'Revenue', formula: '=SUM(B2:B3)', currentValue: 30, expectedValue: '=SUM(B2:B4)', suggestion: 'Extend range', correctFormula: null, details: { unsafe: 'not included' }, ...overrides }
}

function sheet(name = 'Revenue', cells: Record<string, CellInfo> = {}): SheetContext {
  return { name, maxRow: 8, maxColumn: 4, cells, mergedRanges: [], headers: {}, rowLabels: {}, reportType: null }
}

describe('audit evidence', () => {
  it('keeps an observed Excel error and both operands ahead of an unverified repair suggestion', () => {
    const context = sheet('PressCost', {
      G7: cell('G7', 7, 7, { error: '#DIV/0!' }, '=E7/F7'),
      E7: cell('E7', 7, 5, 1500), F7: cell('F7', 7, 6, 0),
    })
    const evidence = buildAuditEvidence(issue({
      sheetName: 'PressCost', cellAddress: 'G7', formula: '=E7/F7',
      correctFormula: '=E7/F6', suggestion: 'Unverified repair suggestion '.repeat(40),
    }), context)
    expect(evidence).toContain('cached value "#DIV/0!" (not recalculated)')
    expect(evidence).toContain('observed reference "PressCost"!E7: value "1500"')
    expect(evidence).toContain('observed reference "PressCost"!F7: value "0"')
    expect(evidence).toContain('business requirement: unknown')
    expect(evidence.length).toBeLessThanOrEqual(MAX_AUDIT_EVIDENCE_CHARS)
  })

  it('adds bounded observed SUM evidence during the same rule scan without treating derived values as business truth', async () => {
    const context = sheet('Revenue', {
      B2: cell('B2', 2, 2, 10), B3: cell('B3', 3, 2, 20), B4: cell('B4', 4, 2, 30),
      B5: cell('B5', 5, 2, 30, '=SUM(B2:B3)'),
    })
    const result = await analyzeExcelFromSheets([context])
    const sum = result.issues.find((candidate) => candidate.ruleId === 'SUM_RANGE_INCOMPLETE')

    expect(sum?.context).toContain('cached value "30" (not recalculated)')
    expect(sum?.context).toContain('rule-derived (not business truth): expectedValue')
    expect(sum?.context).toContain('business requirement: unknown (not declared)')
    expect(sum?.context).toContain('observed reference "Revenue"!B2')
    expect(sum?.context?.length).toBeLessThanOrEqual(MAX_AUDIT_EVIDENCE_CHARS)
  })

  it('uses only the supplied sheet when identical addresses exist elsewhere and omits cross-sheet references', () => {
    const revenue = sheet('Revenue', { B5: cell('B5', 5, 2, 'wrong sheet value', '=SUM(A1:B2)'), A1: cell('A1', 1, 1, 999) })
    const costs = sheet('Costs', { B5: cell('B5', 5, 2, 12, '=Revenue!A1+B2'), B2: cell('B2', 2, 2, 4) })
    const evidence = buildAuditEvidence(issue({ sheetName: 'Costs', formula: '=Revenue!A1+B2' }), costs)

    expect(evidence).toContain('"Costs"!B5')
    expect(evidence).toContain('cross-sheet references omitted: 1')
    expect(evidence).not.toContain('wrong sheet value')
    expect(evidence).not.toContain('"Revenue"!A1')
    expect(buildAuditEvidence(issue({ sheetName: 'Costs', formula: '=Revenue!A1+B2' }), costs)).toBe(evidence)
    expect(revenue.cells.B5.value).toBe('wrong sheet value')
  })

  it('does not turn qualified range tails or quoted cell-like text into local evidence', () => {
    const context = sheet('Current', {
      Z20: cell('Z20', 20, 26, 7, "='Other'!A1 : B2"),
      A1: cell('A1', 1, 1, 'local A1 must not be cited'),
      B2: cell('B2', 2, 2, 'local B2 must not be cited'),
      C3: cell('C3', 3, 3, 5, '="A1"&A2'),
      A2: cell('A2', 2, 1, 'permitted local evidence'),
    })
    const qualified = buildAuditEvidence(issue({ cellAddress: 'Z20', sheetName: 'Current', formula: "='Other'!A1 : B2", expectedValue: undefined, suggestion: '', correctFormula: null }), context)
    const quoted = buildAuditEvidence(issue({ cellAddress: 'C3', sheetName: 'Current', formula: '="A1"&A2', expectedValue: undefined, suggestion: '', correctFormula: null }), context)

    expect(qualified).toContain('cross-sheet references omitted: 1')
    expect(qualified).not.toContain('"Current"!A1')
    expect(qualified).not.toContain('"Current"!B2')
    expect(quoted).toContain('observed reference "Current"!A2')
    expect(quoted).not.toContain('observed reference "Current"!A1')
  })

  it('omits all local-reference guesses for ambiguous 3D qualifiers, including numeric and quoted sheet names', () => {
    const context = sheet('Current', {
      Z20: cell('Z20', 20, 26, 7, '=SUM(A1:B1!C3)'),
      A1: cell('A1', 1, 1, 'must not become a local reference'),
      B1: cell('B1', 1, 2, 'must not become a local reference'),
      C3: cell('C3', 3, 3, 'must not become a local reference'),
      D4: cell('D4', 4, 4, 'mixed local reference must also be omitted', '=SUM(A1:B1!C3)+D4'),
    })
    const numeric3d = buildAuditEvidence(issue({ cellAddress: 'Z20', sheetName: 'Current', formula: '=SUM(A1:B1!C3)', expectedValue: undefined, suggestion: '', correctFormula: null }), context)
    const quoted3d = buildAuditEvidence(issue({ cellAddress: 'D4', sheetName: 'Current', formula: "=SUM('A1':'B1'!C3)+D4", expectedValue: undefined, suggestion: '', correctFormula: null }), context)

    for (const evidence of [numeric3d, quoted3d]) {
      expect(evidence).toContain('cross-sheet references omitted: 1')
      expect(evidence).toContain('complex formula references omitted: 1')
      expect(evidence).not.toContain('observed reference "Current"!A1')
      expect(evidence).not.toContain('observed reference "Current"!B1')
      expect(evidence).not.toContain('observed reference "Current"!C3')
      expect(evidence).not.toContain('observed reference "Current"!D4')
    }
  })

  it('handles absent targets, non-scalar values, long values, and a strict deterministic upper bound', () => {
    const context = sheet('Input', {
      B5: cell('B5', 5, 2, 'x'.repeat(2_000), '=SUM(A1:A2)'),
      A1: cell('A1', 1, 1, { untrusted: 'object' }), A2: cell('A2', 2, 1, 'short'),
      B4: cell('B4', 4, 2, 'neighbor'), C5: cell('C5', 5, 3, 'neighbor two'),
    })
    const evidence = buildAuditEvidence(issue({ sheetName: 'Input', expectedValue: undefined, suggestion: '', correctFormula: null }), context)
    const absent = buildAuditEvidence(issue({ cellAddress: null, formula: null, currentValue: { ignored: true }, expectedValue: undefined }), sheet('Empty'))

    expect(evidence.length).toBeLessThanOrEqual(MAX_AUDIT_EVIDENCE_CHARS)
    expect(evidence).toContain('[truncated]')
    expect(evidence).toContain('[non-scalar value]')
    expect(evidence).not.toContain('untrusted')
    expect(buildAuditEvidence(issue({ sheetName: 'Input', expectedValue: undefined, suggestion: '', correctFormula: null }), context)).toBe(evidence)
    expect(absent).toContain('observed target unavailable')
    expect(absent).toContain('business requirement: unknown')
  })
})
