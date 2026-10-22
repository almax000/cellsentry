import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getPath: vi.fn(() => '/before-test-profile'),
  options: [] as Array<{ logPath?: string | (() => string) }>,
}))

vi.mock('electron', () => ({ app: { getPath: state.getPath } }))
vi.mock('../electron/model/downloader', () => ({
  DEFAULT_MODEL: { filename: 'model.gguf', sha256: 'hash', name: 'Model' },
}))
vi.mock('../electron/model/paths', () => ({
  getModelsDir: () => '/models',
  getRuntimeExecutable: () => '/runtime/llama-server',
}))
vi.mock('../electron/llm/native', () => ({
  NativeLlmRuntime: class {
    constructor(options: { logPath?: string | (() => string) }) {
      state.options.push(options)
    }
  },
}))

import { createLlmBridge } from '../electron/llm/bridge'

describe('native bridge log destination', () => {
  it('resolves userData when a runtime is started instead of during module load', () => {
    expect(state.getPath).not.toHaveBeenCalled()
    createLlmBridge()
    expect(state.getPath).not.toHaveBeenCalled()

    state.getPath.mockReturnValue('/isolated-test-profile')
    const logPath = state.options.at(-1)?.logPath
    expect(typeof logPath).toBe('function')
    // The bridge joins with the platform's separator, so Windows gets backslashes.
    expect(typeof logPath === 'function' ? logPath() : logPath).toBe(
      join('/isolated-test-profile', 'logs', 'llama-server.log'),
    )
  })
})
