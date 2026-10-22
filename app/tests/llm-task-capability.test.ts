import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ spawned: 0 }))

vi.mock('fs', () => ({
  existsSync: () => true,
  createReadStream: () => ({ async *[Symbol.asyncIterator]() { yield Buffer.from('model') } }),
  mkdirSync: () => {}, openSync: () => 1, closeSync: () => {},
}))
vi.mock('crypto', () => ({
  createHash: () => ({ update: () => {}, digest: () => 'model-hash' }),
  randomBytes: () => ({ toString: () => 'test-key' }),
}))
vi.mock('net', () => ({ createServer: () => ({ once: () => {}, listen: (_p: number, _h: string, done: () => void) => done(), address: () => ({ port: 43123 }), close: (done: () => void) => done() }) }))
vi.mock('child_process', () => ({ spawn: () => { state.spawned += 1; throw new Error('spawn must not be reached') } }))
vi.mock('electron', () => ({ net: {} }))

import { NativeLlmRuntime } from '../electron/llm/native'
import { supportsModelTask, unsupportedTaskReason } from '../electron/llm/capabilities'
import { DEFAULT_MODEL } from '../electron/model/downloader'

const formulaOnlyOptions = {
  serverPath: '/runtime/llama-server', modelPath: '/models/formula.gguf',
  modelSha256: 'model-hash', modelName: 'Formula candidate', supportedTasks: ['audit'] as const,
}

describe('formula-only model capabilities', () => {
  it('declares audit as its only configured task', () => {
    expect(DEFAULT_MODEL.supportedTasks).toEqual(['audit'])
    expect(supportsModelTask(formulaOnlyOptions.supportedTasks, 'audit')).toBe(true)
    expect(supportsModelTask(formulaOnlyOptions.supportedTasks, 'pii')).toBe(false)
    expect(unsupportedTaskReason('Formula candidate', formulaOnlyOptions.supportedTasks, 'extraction'))
      .toContain('Deterministic fallback remains in use')
  })

  it.each(['pii', 'extraction'] as const)('refuses %s before native start or generation', async (mode) => {
    state.spawned = 0
    const runtime = new NativeLlmRuntime(formulaOnlyOptions)
    const start = vi.spyOn(runtime, 'start')

    await expect(runtime.send({ method: 'analyze', params: { mode, cells: [{ address: 'Sheet1!A1', value: 'sample value' }] } }))
      .resolves.toMatchObject({ error: expect.stringContaining(`Unsupported task "${mode}"`) })

    expect(start).not.toHaveBeenCalled()
    expect(state.spawned).toBe(0)
  })

  it('returns unsupported PII immediately while a serialized audit slot is blocked', async () => {
    const runtime = new NativeLlmRuntime(formulaOnlyOptions)
    ;(runtime as unknown as { queue: Promise<unknown> }).queue = new Promise(() => {})

    await expect(runtime.send({ method: 'analyze', params: { mode: 'pii', cells: [] } }))
      .resolves.toMatchObject({ error: expect.stringContaining('Unsupported task "pii"') })
  })
})
