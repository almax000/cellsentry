/** Electron adapter for the bundled native llama.cpp runtime. No Python required. */
import { app } from 'electron'
import { join } from 'path'
import { DEFAULT_MODEL } from '../model/downloader'
import { getModelsDir, getRuntimeExecutable } from '../model/paths'
import { NativeLlmRuntime } from './native'

export function createLlmBridge(): NativeLlmRuntime {
  return new NativeLlmRuntime({
    modelPath: join(getModelsDir(), DEFAULT_MODEL.filename),
    modelSha256: DEFAULT_MODEL.sha256,
    modelName: DEFAULT_MODEL.name,
    supportedTasks: DEFAULT_MODEL.supportedTasks,
    serverPath: getRuntimeExecutable(),
    gpuLayers: Number(process.env.CELLSENTRY_GPU_LAYERS ?? (process.platform === 'darwin' && process.arch === 'arm64' ? 99 : 0)),
    // Electron tests can set an isolated userData profile after importing main
    // modules. Resolve this only when the native child actually starts.
    logPath: () => join(app.getPath('userData'), 'logs', 'llama-server.log'),
  })
}

export const llmBridge = createLlmBridge()
