import { describe, expect, it } from 'vitest'
import type { RendererIssue } from '../electron/engine/ruleEngine'
import { mapToLlmInput, orderAuditIssuesBySeverity } from '../electron/main/auditInput'

function issue(id: string, severity: RendererIssue['severity']): RendererIssue {
  return {
    id, severity, ruleId: 'rule', cell: 'B2', sheet: 'Sheet', formula: null,
    message: 'Finding', confidence: 0.9, category: 'Formula', layer: 'rule',
    suggestion: 'Check', currentValue: 1, expectedValue: 2, correctFormula: null,
  }
}

describe('product audit input', () => {
  it('maps only model fields, preserving context and normalizing null formula', () => {
    const original = { ...issue('one', 'error'), context: 'Observed evidence' }
    expect(mapToLlmInput([original])).toEqual([{
      ruleId: 'rule', cellAddress: 'B2', sheetName: 'Sheet', formula: '',
      message: 'Finding', confidence: 0.9, context: 'Observed evidence',
    }])
    expect(mapToLlmInput([issue('two', 'info')])[0].context).toBeUndefined()
    expect(mapToLlmInput([{ ...original, formula: 'SUM(A1:A2)' }])[0].formula).toBe('SUM(A1:A2)')
  })

  it('orders severity stably without mutating the scan or copying issues', () => {
    const original = [issue('w1', 'warning'), issue('i1', 'info'), issue('e1', 'error'),
      issue('w2', 'warning'), issue('e2', 'error'), issue('u1', 'other' as RendererIssue['severity']),
      issue('i2', 'info'), issue('u2', 'other' as RendererIssue['severity'])]
    const snapshot = [...original]
    const ordered = orderAuditIssuesBySeverity(original)
    expect(ordered.map(entry => entry.id)).toEqual(['e1', 'e2', 'w1', 'w2', 'i1', 'i2', 'u1', 'u2'])
    expect(original).toEqual(snapshot)
    expect(ordered[0]).toBe(original[2])
  })
})
