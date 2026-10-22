import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  startCalls: 0,
  shutdownCalls: 0,
  sends: [] as unknown[],
  status: { available: false, backend: 'none', modelLoaded: false },
}))

vi.mock('../electron/llm/bridge', () => ({
  llmBridge: {
    get status() { return bridge.status },
    async start() { bridge.startCalls++; bridge.status = { available: true, backend: 'llama.cpp', modelLoaded: true }; return true },
    async shutdown() { bridge.shutdownCalls++; bridge.status = { available: false, backend: 'none', modelLoaded: false } },
    async send(request: unknown) { bridge.sends.push(request); return { id: bridge.sends.length, result: { judgments: [] } } },
  },
}))
vi.mock('electron', () => ({ app: { on: () => {}, quit: () => {} } }))

import { cancelLlmAnalysis, getLlmStatus, isLocalAiReadyFor, startLlm } from '../electron/llm/lifecycle'
import { parseAudit } from '../electron/llm/protocol'
import { mergeJudgments } from '../electron/llm/reconcile'

const issue = { id: 'issue-0', sheet: 'Revenue', ruleId: 'formula_gap', cellAddress: 'B4', confidence: 0.9 }
const input = { sheetName: 'Revenue', ruleId: 'formula_gap', cellAddress: 'B4', formula: '=SUM(B1:B3)', message: 'Gap', confidence: 0.9 }

beforeEach(() => {
  bridge.startCalls = 0; bridge.shutdownCalls = 0; bridge.sends = []
  bridge.status = { available: false, backend: 'none', modelLoaded: false }
})

describe('native lifecycle adapter', () => {
  it('reports status without starting a native runtime', async () => {
    await expect(getLlmStatus()).resolves.toMatchObject({ available: false, backend: 'none' })
    expect(bridge.startCalls).toBe(0)
  })

  it('starts only through the explicit warm-up action', async () => {
    await expect(startLlm()).resolves.toMatchObject({ available: true, backend: 'llama.cpp' })
    expect(bridge.startCalls).toBe(1)
  })

  it('delegates cancellation to native shutdown without a replacement start', async () => {
    await cancelLlmAnalysis()
    expect(bridge.shutdownCalls).toBe(1)
    expect(bridge.startCalls).toBe(0)
  })

  it('treats an installed bridge double without a pre-check as ready, without starting it', () => {
    for (const mode of ['audit', 'pii', 'extraction'] as const) expect(isLocalAiReadyFor(mode)).toBe(true)
    expect(bridge.startCalls).toBe(0)
    expect(bridge.sends).toHaveLength(0)
  })
})

describe('native response safety', () => {
  it('rejects invalid JSON before it can annotate a deterministic finding', () => {
    expect(() => parseAudit('{not json', input)).toThrow()
    const [result] = mergeJudgments([issue], [])
    expect(result).toMatchObject({ id: 'issue-0', confidence: 0.9 })
    expect(result.llmVerified).toBeUndefined()
  })

  it('rejects a wrong rule or cell identity before it can annotate a finding', () => {
    expect(() => parseAudit('[{"cellAddress":"B5","ruleId":"other_rule","isValid":false,"adjustedConfidence":0.2,"reasoning":"wrong target"}]', input)).toThrow()
    const [result] = mergeJudgments([issue], [])
    expect(result.llmVerified).toBeUndefined()
    expect(result.llmDisputed).toBeUndefined()
  })

  it('binds an accepted response to the source worksheet before reconciliation', () => {
    const judgments = parseAudit('[{"cellAddress":"B4","ruleId":"formula_gap","isValid":false,"adjustedConfidence":0.2,"reasoning":"review"}]', input)
    const result = mergeJudgments([issue, { ...issue, id: 'other-sheet', sheet: 'Costs' }], judgments)
    expect(result[0]).toMatchObject({ llmVerified: false, llmDisputed: true })
    expect(result[1].llmVerified).toBeUndefined()
  })

  it('turns a protected cancellation into a review request, never a dispute', () => {
    const storage = { ...issue, ruleId: 'storage', formula: '=SUM(B1:B3)' }
    const judgments = parseAudit('[{"cellAddress":"B4","ruleId":"storage","isValid":false,"adjustedConfidence":0.99,"reasoning":"looks fine"}]',
      { ...input, ruleId: 'storage' })
    const [result] = mergeJudgments([storage], judgments)
    expect(result).toMatchObject({ llmReviewRequired: true, confidence: 0.9 })
    expect(result.llmVerified).toBeUndefined()
    expect(result.llmDisputed).toBeUndefined()
  })
})
