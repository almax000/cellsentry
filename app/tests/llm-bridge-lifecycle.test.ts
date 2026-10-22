import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  holdHash: false,
  releaseHash: undefined as (() => void) | undefined,
  onSpawn: undefined as (() => void) | undefined,
  failHealth: false,
  healthy: false,
  killErrorsBeforeExit: 0,
  children: [] as Array<{ pid: number; exitCode: number | null; signalCode: string | null; kills: string[]; emit: (event: string, ...args: unknown[]) => boolean; once: (event: string, listener: (...args: unknown[]) => void) => unknown }>,
}))

vi.mock('fs', () => ({
  existsSync: () => true,
  createReadStream: () => ({
    async *[Symbol.asyncIterator]() {
      if (state.holdHash) await new Promise<void>((resolve) => { state.releaseHash = resolve })
      yield Buffer.from('model')
    },
  }),
  mkdirSync: () => {}, openSync: () => 1, closeSync: () => {},
}))
vi.mock('crypto', () => ({
  createHash: () => ({ update: () => {}, digest: () => 'expected-model-hash' }),
  randomBytes: () => ({ toString: () => 'test-api-key' }),
}))
vi.mock('net', () => ({
  createServer: () => ({ once: () => {}, listen: (_port: number, host: string, done: () => void) => done(), address: () => ({ port: 43123 }), close: (done: (error?: Error) => void) => done() }),
}))
vi.mock('timers/promises', () => ({ setTimeout: async () => {} }))
vi.mock('child_process', () => ({
  spawn: () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const child = {
      exitCode: null as number | null,
      signalCode: null as string | null,
      pid: 4242,
      kills: [] as string[],
      once(event: string, listener: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), listener]) },
      emit(event: string, ...args: unknown[]) { for (const listener of listeners.get(event) ?? []) listener(...args); return true },
      kill(signal: string) {
        child.kills.push(signal)
        if (state.killErrorsBeforeExit > 0) {
          state.killErrorsBeforeExit -= 1
          child.emit('error', new Error('kill reported an error before exit'))
          return true
        }
        child.exitCode = 0
        child.emit('exit')
        return true
      },
    }
    state.children.push(child)
    state.onSpawn?.()
    return child
  },
}))
vi.mock('electron', () => ({
  net: {
    request: (requestOptions: { url?: string }) => {
      const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
      const request = {
        once(event: string, listener: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), listener]) },
        on(event: string, listener: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), listener]); return request },
        emit(event: string, ...args: unknown[]) { for (const listener of listeners.get(event) ?? []) listener(...args); return true },
      } as { setHeader: () => void; abort: () => void; end: () => void; on: (event: string, listener: (...args: unknown[]) => void) => unknown; emit: (event: string, ...args: unknown[]) => boolean }
      request.setHeader = () => {}
      request.abort = () => { request.emit('error', new Error('aborted')) }
    request.end = () => {
      if (state.healthy) {
        const url = requestOptions.url ?? ''
        const body = url.endsWith('/health') ? { status: 'ok' }
          : url.endsWith('/props') ? { model_path: '/models/cellsentry.gguf' } : undefined
        if (body) {
          queueMicrotask(() => {
            const responseListeners = new Map<string, Array<(...args: unknown[]) => void>>()
            const response = {
              statusCode: 200,
              on(event: string, listener: (...args: unknown[]) => void) { responseListeners.set(event, [...(responseListeners.get(event) ?? []), listener]); return response },
              emit(event: string, ...args: unknown[]) { for (const listener of responseListeners.get(event) ?? []) listener(...args); return true },
            }
            request.emit('response', response)
            response.emit('data', Buffer.from(JSON.stringify(body)))
            response.emit('end')
          })
          return
        }
      }
        if (state.failHealth) {
          queueMicrotask(() => {
            state.children.at(-1)?.emit('error', new Error('native server failed while loading'))
            request.emit('error', new Error('connection failed'))
          })
        }
      }
      return request
    },
  },
}))

import { NativeLlmRuntime } from '../electron/llm/native'

const options = {
  serverPath: '/runtime/llama-server', modelPath: '/models/cellsentry.gguf',
  modelSha256: 'expected-model-hash', modelName: 'test-model', timeoutMs: 5,
}
const issue = { sheetName: 'Revenue', cellAddress: 'B4', ruleId: 'formula_gap', formula: '=SUM(B1:B3)', message: 'Gap', confidence: 0.9 }

beforeEach(() => {
  state.holdHash = false
  state.releaseHash = undefined
  state.onSpawn = undefined
  state.failHealth = false
  state.healthy = false
  state.killErrorsBeforeExit = 0
  state.children = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('NativeLlmRuntime lifecycle', () => {
  it('terminates an already-running native child during shutdown', async () => {
    const runtime = new NativeLlmRuntime(options)
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const child = {
      exitCode: null as number | null, signalCode: null as string | null, kills: [] as string[],
      once(event: string, listener: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), listener]) },
      kill(signal: string) { child.kills.push(signal); child.exitCode = 0; for (const listener of listeners.get('exit') ?? []) listener(); return true },
    }
    ;(runtime as unknown as { child: unknown; _status: unknown }).child = child
    ;(runtime as unknown as { _status: unknown })._status = { available: true, backend: 'llama.cpp', modelLoaded: true }

    await runtime.shutdown()

    expect(child.kills).toEqual(['SIGTERM'])
    expect(runtime.status).toMatchObject({ available: false, backend: 'none', modelLoaded: false })
  })

  it('retains a child handle after termination failure so a later shutdown can retry', async () => {
    const runtime = new NativeLlmRuntime(options)
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    let failTermination = true
    const child = {
      exitCode: null as number | null, signalCode: null as string | null, kills: [] as string[],
      once(event: string, listener: (...args: unknown[]) => void) { listeners.set(event, [...(listeners.get(event) ?? []), listener]) },
      kill(signal: string) {
        child.kills.push(signal)
        if (failTermination) {
          for (const listener of listeners.get('error') ?? []) listener(new Error('termination transport failed'))
        } else {
          child.exitCode = 0
          for (const listener of listeners.get('exit') ?? []) listener()
        }
        return true
      },
    }
    ;(runtime as unknown as { child: unknown; _status: unknown }).child = child
    ;(runtime as unknown as { _status: unknown })._status = { available: true, backend: 'llama.cpp', modelLoaded: true }

    await expect(runtime.shutdown()).rejects.toThrow('termination transport failed')
    expect((runtime as unknown as { child: unknown }).child).toBe(child)
    expect(runtime.status.available).toBe(true)
    await expect(runtime.start()).resolves.toBe(true)
    expect(state.children).toHaveLength(0)

    failTermination = false
    await expect(runtime.shutdown()).resolves.toBeUndefined()
    expect((runtime as unknown as { child: unknown }).child).toBeNull()
    expect(runtime.status).toMatchObject({ available: false, reason: 'stopped' })
  })

  it('terminates a child spawned after shutdown invalidates an in-flight start', async () => {
    const runtime = new NativeLlmRuntime(options)
    let stopping: Promise<void> | undefined
    state.onSpawn = () => { stopping = runtime.shutdown() }
    const starting = runtime.start()

    await expect(starting).resolves.toBe(false)
    await stopping
    expect(state.children).toHaveLength(1)
    expect(state.children[0].kills).toEqual(['SIGTERM'])
    expect(runtime.status.available).toBe(false)
  })

  it('cleans up a partial startup when the native child exits during health checking', async () => {
    state.failHealth = true
    const runtime = new NativeLlmRuntime(options)

    await expect(runtime.start()).resolves.toBe(false)

    expect(state.children).toHaveLength(1)
    expect((runtime as unknown as { child: unknown }).child).toBeNull()
    expect(runtime.status).toMatchObject({ available: false, backend: 'none', modelLoaded: false })
  })

  it('keeps a started child after error without exit and retries that same handle on shutdown', async () => {
    state.healthy = true
    const runtime = new NativeLlmRuntime(options)
    await expect(runtime.start()).resolves.toBe(true)
    const child = state.children[0]

    child.emit('error', new Error('runtime transport error'))
    expect((runtime as unknown as { child: unknown }).child).toBe(child)
    expect(runtime.status).toMatchObject({ available: false, reason: 'runtime-unavailable' })

    state.killErrorsBeforeExit = 1
    await expect(runtime.shutdown()).rejects.toThrow('kill reported an error before exit')
    expect((runtime as unknown as { child: unknown }).child).toBe(child)

    await expect(runtime.shutdown()).resolves.toBeUndefined()
    expect(child.kills).toEqual(['SIGTERM', 'SIGTERM'])
    expect((runtime as unknown as { child: unknown }).child).toBeNull()
  })

  it('does not restart after cancelling queued batch requests', async () => {
    const runtime = new NativeLlmRuntime(options)
    const start = vi.spyOn(runtime, 'start')
    const first = runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [issue] } })
    const second = runtime.send({ method: 'analyze', params: { mode: 'audit', issues: [{ ...issue, cellAddress: 'B5' }] } })
    await runtime.shutdown()

    await expect(first).resolves.toMatchObject({ error: 'Inference cancelled' })
    await expect(second).resolves.toMatchObject({ error: 'Inference cancelled' })
    expect(start).not.toHaveBeenCalled()
    expect(state.children).toHaveLength(0)
  })
})
