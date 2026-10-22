import { beforeEach, describe, expect, it, vi } from 'vitest'

const { send, shutdown, status } = vi.hoisted(() => ({
  send: vi.fn(),
  shutdown: vi.fn(async () => {}),
  status: { available: true, backend: 'llama.cpp', modelLoaded: true },
}))

vi.mock('electron', () => ({ app: { on: vi.fn(), quit: vi.fn() } }))
vi.mock('../electron/llm/bridge', () => ({ llmBridge: {
  send,
  shutdown,
  start: vi.fn(async () => {}),
  status,
} }))

import { AuditReviewStopError, cancelLlmAnalysis, reviewAuditIssues } from '../electron/llm/lifecycle'

const issue = (cellAddress: string) => ({
  sheetName: 'Audit', cellAddress, ruleId: 'formula', formula: '=SUM(A1:A2)',
  message: 'Check total', confidence: 0.9,
})
const judgmentFor = (input: ReturnType<typeof issue>) => ({
  sheetName: input.sheetName,
  cellAddress: input.cellAddress,
  ruleId: input.ruleId,
  isValid: true,
  adjustedConfidence: 0.8,
  reasoning: 'Matches the formula pattern.',
})
const responseFor = (input: ReturnType<typeof issue>) => ({ result: { judgments: [judgmentFor(input)] } })

describe('bounded audit review', () => {
  beforeEach(() => {
    send.mockReset()
    shutdown.mockReset()
    shutdown.mockResolvedValue(undefined)
    status.available = true
    status.modelLoaded = true
    status.backend = 'llama.cpp'
  })

  it('retains valid judgments around a malformed response and closes the counters', async () => {
    const first = issue('A1')
    const middle = issue('A2')
    const last = issue('A3')
    send.mockResolvedValueOnce(responseFor(first))
    send.mockResolvedValueOnce({ error: 'Invalid audit model response' })
    send.mockResolvedValueOnce(responseFor(last))

    const result = await reviewAuditIssues([first, middle, last])

    expect(result.judgments).toEqual([judgmentFor(first), judgmentFor(last)])
    expect(result.summary).toEqual({
      total: 3, selected: 3, attempted: 3, reviewed: 2, failed: 1, skipped: 0,
      stopReason: 'complete',
    })
  })

  it('does not submit candidates beyond the configured cap', async () => {
    const candidates = [issue('A1'), issue('A2'), issue('A3')]
    send.mockImplementation(async (request) => responseFor(request.params.issues[0]))

    const result = await reviewAuditIssues(candidates, { maxCandidates: 2 })

    expect(send).toHaveBeenCalledTimes(2)
    expect(result.judgments).toHaveLength(2)
    expect(result.summary).toEqual({
      total: 3, selected: 2, attempted: 2, reviewed: 2, failed: 0, skipped: 1,
      stopReason: 'candidate-limit',
    })
  })

  it('rejects duplicate or wrong-identity judgments as a failed candidate', async () => {
    const candidate = issue('A1')
    send.mockResolvedValue({ result: { judgments: [
      judgmentFor(candidate), { ...judgmentFor(candidate), cellAddress: 'A2' },
    ] } })

    const result = await reviewAuditIssues([candidate])

    expect(result.judgments).toEqual([])
    expect(result.summary).toMatchObject({ attempted: 1, reviewed: 0, failed: 1 })
  })

  it('does not count malformed same-identity output or a response error as reviewed', async () => {
    const candidate = issue('A1')
    send.mockResolvedValueOnce({ result: { judgments: [{
      ...judgmentFor(candidate), adjustedConfidence: Number.POSITIVE_INFINITY, reasoning: ' ',
    }] } })
    send.mockResolvedValueOnce({ error: 'Transport failed', result: { judgments: [judgmentFor(candidate)] } })

    const malformed = await reviewAuditIssues([candidate])
    const errored = await reviewAuditIssues([candidate])

    expect(malformed).toMatchObject({ judgments: [], summary: { attempted: 1, reviewed: 0, failed: 1 } })
    expect(errored).toMatchObject({ judgments: [], summary: { attempted: 1, reviewed: 0, failed: 1 } })
  })

  it('stops after the first unavailable runtime response', async () => {
    status.available = false
    status.modelLoaded = false
    send.mockResolvedValue({ error: 'Native runtime unavailable' })

    const result = await reviewAuditIssues([issue('A1'), issue('A2')])

    expect(send).toHaveBeenCalledTimes(1)
    expect(result.summary).toEqual({
      total: 2, selected: 2, attempted: 1, reviewed: 0, failed: 1, skipped: 1,
      stopReason: 'model-unavailable',
    })
  })

  it('shuts down and waits for an active request when its deadline expires', async () => {
    const candidate = issue('A1')
    let settleRequest!: (value: unknown) => void
    send.mockImplementationOnce(() => new Promise(resolve => { settleRequest = resolve }))
    shutdown.mockImplementationOnce(async () => {
      settleRequest({ error: 'Inference cancelled' })
    })

    const result = await reviewAuditIssues([candidate, issue('A2')], { timeBudgetMs: 5 })

    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.judgments).toEqual([])
    expect(result.summary).toEqual({
      total: 2, selected: 2, attempted: 1, reviewed: 0, failed: 1, skipped: 1,
      stopReason: 'time-budget',
    })
  })

  it('throws a typed error with partial results when deadline shutdown fails', async () => {
    const first = issue('A1')
    let settleRequest!: (value: unknown) => void
    send.mockResolvedValueOnce(responseFor(first))
    send.mockImplementationOnce(() => new Promise(resolve => { settleRequest = resolve }))
    const stopError = new Error('native stop failed')
    shutdown.mockRejectedValueOnce(stopError)

    const pending = reviewAuditIssues([first, issue('A2')], { timeBudgetMs: 10 })
    await expect(pending).rejects.toMatchObject({
      name: 'AuditReviewStopError',
      judgments: [judgmentFor(first)],
      summary: {
        total: 2, selected: 2, attempted: 2, reviewed: 1, failed: 1, skipped: 0,
        stopReason: 'time-budget',
      },
      cause: stopError,
    } satisfies Partial<AuditReviewStopError>)
    settleRequest({ error: 'late native response' })
  })

  it('emits initial scope then drops cancelled results without later progress', async () => {
    const candidate = issue('A1')
    let settleRequest!: (value: unknown) => void
    send.mockImplementationOnce(() => new Promise(resolve => { settleRequest = resolve }))
    const onProgress = vi.fn()
    const pending = reviewAuditIssues([candidate, issue('A2')], { onProgress })
    await Promise.resolve()

    await cancelLlmAnalysis()
    settleRequest(responseFor(candidate))
    const result = await pending

    expect(send).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith({
      total: 2, selected: 2, attempted: 0, reviewed: 0, failed: 0, skipped: 2,
      stopReason: undefined,
    })
    expect(result.judgments).toEqual([])
    expect(result.summary).toEqual({
      total: 2, selected: 2, attempted: 1, reviewed: 1, failed: 0, skipped: 1,
      stopReason: 'cancelled',
    })
  })
})
