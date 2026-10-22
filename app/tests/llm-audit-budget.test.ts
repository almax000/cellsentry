import { describe, expect, it, vi } from 'vitest'
import { NativeLlmRuntime } from '../electron/llm/native'

const options = { serverPath: '/runtime/llama-server', modelPath: '/models/model.gguf', modelSha256: 'hash', modelName: 'test model', timeoutMs: 1 }
const issue = { sheetName: 'Revenue', cellAddress: 'B4', ruleId: 'formula_gap', formula: '=SUM(B1:B3)', message: 'Gap', confidence: 0.9 }

function runtimeWithHttp(replies: unknown[]) {
  const runtime = new NativeLlmRuntime(options)
  vi.spyOn(runtime, 'start').mockResolvedValue(true)
  const http = vi.fn()
  for (const reply of replies) http.mockResolvedValueOnce(reply)
  ;(runtime as unknown as { http: typeof http }).http = http
  return { runtime, http }
}

describe('audit prompt budget preflight', () => {
  it('applies the same non-thinking template, tokenizes it, then permits a within-budget completion', async () => {
    const { runtime, http } = runtimeWithHttp([
      { prompt: '<formatted-audit-prompt>' }, { tokens: Array(100).fill(7) },
      { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify([{ cellAddress: 'B4', ruleId: 'formula_gap', isValid: true, adjustedConfidence: 0.9, reasoning: 'Rule applies.' }]) } }] },
    ])

    await expect(runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [issue] } }))
      .resolves.toMatchObject({ result: { judgments: [{ cellAddress: 'B4', sheetName: 'Revenue' }] } })
    expect(http.mock.calls.map(([path]) => path)).toEqual(['/apply-template', '/tokenize', '/v1/chat/completions'])
    expect(http.mock.calls[0][1]).toMatchObject({ messages: expect.any(Array), chat_template_kwargs: { enable_thinking: false } })
    expect(http.mock.calls[1][1]).toEqual({ content: '<formatted-audit-prompt>', add_special: false, parse_special: true })
  })

  it('does not request a completion for an emoji payload above the local byte safety limit', async () => {
    const { runtime, http } = runtimeWithHttp([])
    const oversized = { ...issue, formula: `=${'😀'.repeat(20_000)}` }

    await expect(runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [oversized] } }))
      .resolves.toMatchObject({ error: expect.stringContaining('payload safety limit') })
    expect(http).not.toHaveBeenCalled()
  })

  it('does not request completion when token count exceeds output reserve and context margin', async () => {
    const { runtime, http } = runtimeWithHttp([{ prompt: 'long formula' }, { tokens: Array(573).fill(1) }])

    await expect(runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [issue] } }))
      .resolves.toMatchObject({ error: expect.stringContaining('exceeds context budget') })
    expect(http.mock.calls.map(([path]) => path)).toEqual(['/apply-template', '/tokenize'])
  })

  it('fails closed when template preflight is malformed and never calls completion', async () => {
    const { runtime, http } = runtimeWithHttp([{ prompt: '   ' }])

    await expect(runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [issue] } }))
      .resolves.toMatchObject({ error: expect.stringContaining('preflight failed') })
    expect(http.mock.calls.map(([path]) => path)).toEqual(['/apply-template'])
  })

  it.each([[], ['not-a-token'], [-1], [1.5]])('rejects malformed token IDs %j without completion', async (tokens) => {
    const { runtime, http } = runtimeWithHttp([{ prompt: '<formatted>' }, { tokens }])

    await expect(runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [issue] } }))
      .resolves.toMatchObject({ error: expect.stringContaining('non-empty safe token IDs') })
    expect(http.mock.calls.map(([path]) => path)).toEqual(['/apply-template', '/tokenize'])
  })

  it('does not tokenize or complete when cancellation occurs while template preflight is paused', async () => {
    let entered!: () => void
    let release!: () => void
    const enteredTemplate = new Promise<void>((resolve) => { entered = resolve })
    const pausedTemplate = new Promise<void>((resolve) => { release = resolve })
    const runtime = new NativeLlmRuntime(options)
    vi.spyOn(runtime, 'start').mockResolvedValue(true)
    const http = vi.fn(async (path: string) => {
      if (path === '/apply-template') {
        entered()
        await pausedTemplate
        return { prompt: '<late-template>' }
      }
      throw new Error(`unexpected request ${path}`)
    })
    ;(runtime as unknown as { http: typeof http }).http = http

    const pending = runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [issue] } })
    await enteredTemplate
    await runtime.shutdown()
    release()

    await expect(pending).resolves.toMatchObject({ error: 'Inference cancelled' })
    expect(http.mock.calls.map(([path]) => path)).toEqual(['/apply-template'])
  })
})
