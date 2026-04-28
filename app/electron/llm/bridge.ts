/**
 * LLM Bridge — manages a Python subprocess that hosts the local LLM.
 *
 * Communication uses JSON-lines over stdin/stdout (one JSON object per line).
 * The bridge is fault-tolerant: if Python or the model is unavailable, the app
 * continues in rules-only mode without errors.
 */

import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { isOcrEnabled, selectOcrModel } from '../model/tierSelector'
import type { LlmRequest, LlmResponse, LlmStatus } from './types'

const REQUEST_TIMEOUT_MS = 60_000
const SHUTDOWN_GRACE_MS = 5_000

interface PendingRequest {
  resolve: (r: LlmResponse) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class LlmBridge {
  private process: ChildProcess | null = null
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private buffer = ''
  private _status: LlmStatus = { available: false, backend: 'none', modelLoaded: false }
  private starting: Promise<boolean> | null = null

  get status(): LlmStatus {
    return this._status
  }

  async start(): Promise<boolean> {
    if (this.process) return this._status.available

    // Day 7 audit: when OCR is disabled (default), no Python subprocess is
    // needed — the bridge only services the OCR method now (safety-net was
    // revoked). Skip spawn entirely so first-launch UX has no Python
    // discovery / subprocess cost.
    if (!isOcrEnabled()) {
      this._status = { available: false, backend: 'none', modelLoaded: false }
      return false
    }

    // Prevent concurrent start attempts
    if (this.starting) return this.starting
    this.starting = this.doStart()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async doStart(): Promise<boolean> {
    const pythonBin = await findPython()
    if (!pythonBin) {
      this._status = { available: false, backend: 'none', modelLoaded: false }
      return false
    }

    const scriptPath = getServerScriptPath()
    if (!existsSync(scriptPath)) {
      this._status = { available: false, backend: 'none', modelLoaded: false }
      return false
    }

    return new Promise<boolean>((resolve) => {
      const child = spawn(pythonBin, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: getProjectRoot(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          CELLSENTRY_MODEL_DIR: getModelDir(),
          CELLSENTRY_OCR_DIRNAME: getActiveOcrDirName(),
        },
      })

      this.process = child

      child.stdout?.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf-8')
        this.drainBuffer()
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf-8').trim()
        if (msg) console.log('[llm-server]', msg)
      })

      child.on('error', () => {
        this.handleProcessExit()
        resolve(false)
      })

      child.on('exit', () => {
        this.handleProcessExit()
      })

      // Probe the server with a status request to confirm it works
      const probeTimeout = setTimeout(() => {
        // If we haven't resolved yet, the server is too slow — treat as unavailable
        this._status = { available: false, backend: 'none', modelLoaded: false }
        resolve(false)
      }, 10_000)

      this.sendRaw({ method: 'status' })
        .then((resp) => {
          clearTimeout(probeTimeout)
          if (resp.result?.status) {
            this._status = resp.result.status
          }
          resolve(this._status.available)
        })
        .catch(() => {
          clearTimeout(probeTimeout)
          this._status = { available: false, backend: 'none', modelLoaded: false }
          resolve(false)
        })
    })
  }

  async send(request: Omit<LlmRequest, 'id'>): Promise<LlmResponse> {
    // Auto-start if not running
    if (!this.process) {
      await this.start()
    }

    if (!this.process) {
      return { id: 0, error: 'LLM bridge unavailable' }
    }

    return this.sendRaw(request)
  }

  private sendRaw(request: Omit<LlmRequest, 'id'>): Promise<LlmResponse> {
    return new Promise<LlmResponse>((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('LLM process stdin not writable'))
        return
      }

      const id = ++this.requestId
      const fullRequest: LlmRequest = { id, ...request }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`LLM request timed out after ${REQUEST_TIMEOUT_MS}ms`))
      }, REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(id, { resolve, reject, timer })

      const line = JSON.stringify(fullRequest) + '\n'
      this.process!.stdin!.write(line, 'utf-8', (err) => {
        if (err) {
          clearTimeout(timer)
          this.pendingRequests.delete(id)
          reject(new Error(`Failed to write to LLM process: ${err.message}`))
        }
      })
    })
  }

  private drainBuffer(): void {
    const lines = this.buffer.split('\n')
    // Keep the last (possibly incomplete) segment in the buffer
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.handleLine(trimmed)
    }
  }

  private handleLine(line: string): void {
    let response: LlmResponse
    try {
      response = JSON.parse(line) as LlmResponse
    } catch {
      console.warn('[llm-bridge] Non-JSON line from server:', line.slice(0, 200))
      return
    }

    const pending = this.pendingRequests.get(response.id)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pendingRequests.delete(response.id)
    pending.resolve(response)
  }

  private handleProcessExit(): void {
    this.process = null
    this._status = { available: false, backend: 'none', modelLoaded: false }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('LLM process exited unexpectedly'))
      this.pendingRequests.delete(id)
    }
  }

  async shutdown(): Promise<void> {
    if (!this.process) return

    try {
      await Promise.race([
        this.sendRaw({ method: 'shutdown' }).catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
      ])
    } catch {
      // Ignore errors during shutdown
    }

    // Force kill if still running
    if (this.process) {
      this.process.kill('SIGTERM')
      // Final fallback after 1s
      const proc = this.process
      setTimeout(() => {
        try { proc.kill('SIGKILL') } catch { /* already dead */ }
      }, 1_000)
      this.process = null
    }

    // Clean up remaining pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('LLM bridge shutting down'))
      this.pendingRequests.delete(id)
    }

    this._status = { available: false, backend: 'none', modelLoaded: false }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProjectRoot(): string {
  if (is.dev) {
    return join(__dirname, '..', '..', '..')
  }
  return join(process.resourcesPath)
}

function getModelDir(): string {
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'models')
}

/** Default OCR model directory the python server should preload — matches
 *  the active tier from tierSelector. Engine layer can still override per
 *  request via params.model_dir. Returns empty string when OCR is disabled
 *  (subprocess never spawns in that case anyway, but defensive). */
function getActiveOcrDirName(): string {
  const model = selectOcrModel()
  return model?.localDirName ?? ''
}

function getServerScriptPath(): string {
  if (is.dev) {
    return join(__dirname, '..', '..', '..', 'scripts', 'llm_server.py')
  }
  return join(process.resourcesPath, 'scripts', 'llm_server.py')
}

async function findPython(): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? ['python3', 'python']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      const { execFile } = await import('child_process')
      const ok = await new Promise<boolean>((resolve) => {
        execFile(cmd, ['--version'], { timeout: 5_000 }, (err) => {
          resolve(!err)
        })
      })
      if (ok) return cmd
    } catch {
      continue
    }
  }
  return null
}

// Singleton
export const llmBridge = new LlmBridge()
