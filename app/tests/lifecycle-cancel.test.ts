import { beforeEach, describe, expect, it, vi } from 'vitest'

const { send, shutdown } = vi.hoisted(() => ({ send: vi.fn(), shutdown: vi.fn(async () => {}) }))
vi.mock('electron', () => ({ app: { on: vi.fn(), quit: vi.fn() } }))
vi.mock('../electron/llm/bridge', () => ({ llmBridge: {
  send,
  shutdown,
  start: vi.fn(async () => {}),
  status: { available: true, backend: 'native', modelLoaded: true },
} }))

import { analyzeWithLlm, cancelLlmAnalysis } from '../electron/llm/lifecycle'

const issue = { sheetName: 'Sheet1', cellAddress: 'A1', ruleId: 'formula', formula: '=1', message: 'x', confidence: 0.9 }

describe('LLM cancellation epoch', () => {
  beforeEach(() => { send.mockReset(); shutdown.mockClear() })

  it('does not submit a later batched audit issue after cancellation', async () => {
    let finishFirst!: () => void
    send.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = () => resolve({ result: { judgments: [] } }) }))
    const pending = analyzeWithLlm([issue, { ...issue, cellAddress: 'A2' }])
    await Promise.resolve()
    await cancelLlmAnalysis()
    finishFirst()
    await expect(pending).resolves.toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('propagates a native response error so deterministic scanners can retain their findings with an AI warning', async () => {
    send.mockResolvedValueOnce({ error: 'Invalid audit model response' })
    await expect(analyzeWithLlm([issue])).rejects.toThrow('Invalid audit model response')
  })
})
