import { app } from 'electron'
import { readFileSync } from 'fs'
import { join, resolve, sep } from 'path'

export function getModelsDir(): string {
  if (process.env.CELLSENTRY_MODEL_DIR) return resolve(process.env.CELLSENTRY_MODEL_DIR)
  if (!app.isPackaged) return join(app.getAppPath(), '..', 'models')
  return join(app.getPath('userData'), 'models')
}

export function getRuntimeDir(): string {
  const root = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), '..')
  return join(root, 'native', `${process.platform}-${process.arch}`)
}

export function getBundledModelDir(): string {
  return join(process.resourcesPath, 'offline-model')
}

export function getRuntimeExecutable(): string {
  if (process.env.CELLSENTRY_LLAMA_SERVER) return resolve(process.env.CELLSENTRY_LLAMA_SERVER)
  const root = getRuntimeDir()
  try {
    const info = JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')) as { executable: string }
    const executable = resolve(root, info.executable)
    if (executable.startsWith(resolve(root) + sep)) return executable
  } catch { /* missing runtime is reported by the native bridge */ }
  return join(root, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server')
}
