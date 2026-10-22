import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), quit: vi.fn(), isPackaged: false, getAppPath: () => '/missing-app', getPath: () => '/missing-user-data' },
  net: {},
}))

import { DEFAULT_MODEL } from '../electron/model/downloader'
import { NativeLlmRuntime } from '../electron/llm/native'

const modes = ['audit', 'pii', 'extraction'] as const
let directory: string
let lifecycle: typeof import('../electron/llm/lifecycle')
const previousModelDir = process.env.CELLSENTRY_MODEL_DIR

beforeAll(async () => {
  const base = resolve(__dirname, '../../tmp/tests')
  await mkdir(base, { recursive: true })
  directory = await mkdtemp(join(base, 'ai-readiness-'))
  // The production bridge resolves its model path on first import, as in the app.
  process.env.CELLSENTRY_MODEL_DIR = directory
  lifecycle = await import('../electron/llm/lifecycle')
})
afterAll(async () => {
  if (previousModelDir === undefined) delete process.env.CELLSENTRY_MODEL_DIR
  else process.env.CELLSENTRY_MODEL_DIR = previousModelDir
  await rm(directory, { recursive: true, force: true })
})

describe('local AI readiness through the production bridge', () => {
  it('is not ready for any task while the model file is absent', () => {
    for (const mode of modes) expect(lifecycle.isLocalAiReadyFor(mode)).toBe(false)
  })

  it('with the shipped audit-only model installed, is ready for audit only and never starts or hashes it', async () => {
    // Placeholder bytes: readiness is an existence + capability check, not verification.
    await writeFile(join(directory, DEFAULT_MODEL.filename), 'GGUF placeholder')

    expect(lifecycle.isLocalAiReadyFor('audit')).toBe(true)
    expect(lifecycle.isLocalAiReadyFor('pii')).toBe(false)
    expect(lifecycle.isLocalAiReadyFor('extraction')).toBe(false)
    await expect(lifecycle.getLlmStatus()).resolves.toMatchObject({ reason: 'not-started' })
  })
})

describe('native runtime pre-check', () => {
  it('requires the configured model file and honours declared tasks', async () => {
    const modelPath = join(directory, 'generic.gguf')
    const generic = new NativeLlmRuntime({ serverPath: '/runtime/llama-server', modelPath, modelSha256: 'hash', modelName: 'generic' })
    for (const mode of modes) expect(generic.canAttempt(mode)).toBe(false)

    await writeFile(modelPath, 'GGUF placeholder')
    // Generic callers that omit task metadata keep every task, as send() does.
    for (const mode of modes) expect(generic.canAttempt(mode)).toBe(true)

    const piiOnly = new NativeLlmRuntime({ serverPath: '/runtime/llama-server', modelPath, modelSha256: 'hash', modelName: 'pii', supportedTasks: ['pii'] })
    expect(modes.filter((mode) => piiOnly.canAttempt(mode))).toEqual(['pii'])
  })
})
