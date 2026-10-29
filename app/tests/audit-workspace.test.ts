import { describe, expect, it } from 'vitest'

import { buildAuditSnapshot, reviewKey } from '../shared/auditWorkspace'

const issue = {
  sheetName: 'P&L',
  cell: 'F12',
  severity: 'error' as const,
  ruleId: 'SUM_RANGE_INCOMPLETE',
  message: 'Total omits F11',
  suggestion: 'Include F11',
  confidence: 0.9,
  formula: '=SUM(F4:F10)',
  currentValue: '7120',
  llmVerified: true,
  llmDisputed: true,
  llmReasoning: 'Confirm the adjacent expense belongs in the total.',
}

describe('audit review workspace snapshot', () => {
  it('keeps source evidence, AI opinion, and human decision separate in the default all-findings snapshot', () => {
    const key = reviewKey(issue)
    const snapshot = buildAuditSnapshot({
      filePath: '/workbook.xlsx',
      fileName: 'workbook.xlsx',
      format: 'html',
      issues: [issue],
      sourceFingerprint: 'sha256:source',
      reviewDecisions: { [key]: { status: 'not-applicable', note: 'This subtotal intentionally excludes accruals.' } },
    })

    expect(snapshot.scope).toBe('all')
    expect(snapshot.totalFindings).toBe(1)
    expect(snapshot.exportedFindings).toBe(1)
    expect(snapshot.excludedFindings).toBe(0)
    expect(snapshot.rows[0]).toMatchObject({
      reviewKey: key,
      rule: { formula: '=SUM(F4:F10)', observedValue: '7120', message: 'Total omits F11' },
      ai: { status: 'disputed', reasoning: 'Confirm the adjacent expense belongs in the total.' },
      review: { status: 'not-applicable', note: 'This subtotal intentionally excludes accruals.' },
    })
  })

  it('filters only confirmed findings but discloses the unchanged total and excluded count', () => {
    const confirmed = { ...issue, cell: 'F13', ruleId: 'TEXT_NUMBER', formula: '', message: 'Text number' }
    const snapshot = buildAuditSnapshot({
      filePath: '/workbook.xlsx',
      fileName: 'workbook.xlsx',
      format: 'pdf',
      scope: 'confirmed',
      issues: [issue, confirmed],
      reviewDecisions: { [reviewKey(confirmed)]: { status: 'confirmed', note: '' } },
    })

    expect(snapshot.totalFindings).toBe(2)
    expect(snapshot.exportedFindings).toBe(1)
    expect(snapshot.excludedFindings).toBe(1)
    expect(snapshot.rows).toEqual([expect.objectContaining({ reviewKey: reviewKey(confirmed), review: { status: 'confirmed', note: '' } })])
  })

  it('uses a length-prefixed stable key so delimiters in workbook evidence cannot collide', () => {
    expect(reviewKey({ ...issue, sheetName: 'a|b', cell: 'c', ruleId: 'd', formula: 'e' }))
      .not.toBe(reviewKey({ ...issue, sheetName: 'a', cell: 'b|c', ruleId: 'd', formula: 'e' }))
  })

  it('makes a confirmed-only snapshot the single XLSX marker input', () => {
    const confirmed = { ...issue, cell: 'F13', ruleId: 'TEXT_NUMBER' }
    const snapshot = buildAuditSnapshot({
      filePath: '/workbook.xlsx', fileName: 'workbook.xlsx', format: 'xlsx', scope: 'confirmed',
      issues: [issue, confirmed],
      reviewDecisions: { [reviewKey(confirmed)]: { status: 'confirmed', note: '' } },
    })
    expect(snapshot.rows.map((row) => row.cell)).toEqual(['F13'])
  })
})
