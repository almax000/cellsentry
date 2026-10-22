import { describe, expect, it } from 'vitest'
import { parseAudit } from '../electron/llm/protocol'

const issue = {
  sheetName: 'Revenue',
  cellAddress: 'B4',
  ruleId: 'formula_gap',
  formula: '=SUM(B1:B3)',
  message: 'Gap',
  confidence: 0.9,
}

const judgment = {
  isValid: true,
  adjustedConfidence: 0.95,
  reasoning: 'The formula leaves out a row.',
}

describe('legacy Qwen audit identity adapter', () => {
  it('canonicalizes only the historical display forms before strict validation', () => {
    const response = JSON.stringify([{
      ...judgment,
      cellAddress: 'Revenue!B4',
      ruleId: '[formula_gap]',
    }])

    expect(parseAudit(response, issue)).toEqual([{
      ...judgment,
      cellAddress: 'B4',
      ruleId: 'formula_gap',
      sheetName: 'Revenue',
    }])
  })

  it('still rejects a different sheet, cell, or rule identity', () => {
    for (const identity of [
      { cellAddress: 'Costs!B4', ruleId: '[formula_gap]' },
      { cellAddress: 'Revenue!B5', ruleId: '[formula_gap]' },
      { cellAddress: 'Revenue!B4', ruleId: '[other_rule]' },
      { ruleId: '[formula_gap]' },
      { cellAddress: 'Revenue!B4' },
      { sheetName: 'Costs', cellAddress: 'B4', ruleId: 'formula_gap' },
      { sheetName: 'Costs', cellAddress: 'Revenue!B4', ruleId: 'formula_gap' },
      { sheetName: 42, cellAddress: 'B4', ruleId: 'formula_gap' },
    ]) {
      expect(() => parseAudit(JSON.stringify([{ ...judgment, ...identity }]), issue)).toThrow(
        'Invalid audit judgment or identity',
      )
    }
  })
  it('permits an explicitly corroborating sheetName and binds it to the source', () => {
    const response = JSON.stringify([{
      ...judgment,
      sheetName: 'Revenue',
      cellAddress: 'B4',
      ruleId: 'formula_gap',
    }])

    expect(parseAudit(response, issue)).toEqual([{
      ...judgment,
      sheetName: 'Revenue',
      cellAddress: 'B4',
      ruleId: 'formula_gap',
    }])
  })

})
