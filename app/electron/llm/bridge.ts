/** Electron adapter for the bundled native llama.cpp runtime. No Python required. */
import { app } from 'electron'
import { join } from 'path'
import { DEFAULT_MODEL } from '../model/downloader'
import { getModelsDir, getRuntimeExecutable } from '../model/paths'
import { NativeLlmRuntime } from './native'

export const llmBridge = new NativeLlmRuntime({
  modelPath: join(getModelsDir(), DEFAULT_MODEL.filename),
  modelSha256: DEFAULT_MODEL.sha256,
  modelName: DEFAULT_MODEL.name,
  serverPath: getRuntimeExecutable(),
  gpuLayers: Number(process.env.CELLSENTRY_GPU_LAYERS ?? (process.platform === 'darwin' && process.arch === 'arm64' ? 99 : 0)),
  logPath: join(app.getPath('userData'), 'logs', 'llama-server.log'),
})
