/** Owns one native llama-server and a serialized local request queue. */
import { spawn, type ChildProcess } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { createReadStream, existsSync, mkdirSync, openSync, closeSync } from 'fs'
import { dirname, resolve } from 'path'
import { createServer } from 'net'
import { setTimeout as delay } from 'timers/promises'
import { buildAuditPrompt, buildPiiMessages, buildExtractionMessages } from './prompts'
import { parseAudit, parsePii, parseExtraction } from './protocol'
import { ALL_LLM_ANALYSIS_MODES, supportsModelTask, unsupportedTaskReason } from './capabilities'
import type { LlmAnalysisMode, LlmRequest, LlmResponse, LlmStatus } from './types'

const AUDIT_CONTEXT_WINDOW_TOKENS = 1024
const AUDIT_MAX_OUTPUT_TOKENS = 420
const AUDIT_TOKEN_MARGIN = 32
const AUDIT_MAX_INPUT_TOKENS = AUDIT_CONTEXT_WINDOW_TOKENS - AUDIT_MAX_OUTPUT_TOKENS - AUDIT_TOKEN_MARGIN
const AUDIT_MAX_TEMPLATE_BYTES = 64 * 1024
type ChatMessage = { role: string; content: string }

export interface NativeRuntimeOptions {
  serverPath: string
  modelPath: string
  modelSha256: string
  modelName: string
  /** Omitted only by generic/test callers; production bridge passes model metadata. */
  supportedTasks?: readonly LlmAnalysisMode[]
  gpuLayers?: number
  /** Resolved on start so Electron test/user profiles are not captured at module load. */
  logPath?: string | (() => string)
  timeoutMs?: number
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((done, reject) => server.close(e => e ? reject(e) : done()))
  if (!port) throw new Error('Cannot allocate local inference port')
  return port
}

export class NativeLlmRuntime {
  private child: ChildProcess | null = null
  private url = ''
  private apiKey = ''
  private starting: Promise<boolean> | null = null
  private stopping: Promise<void> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private epoch = 0
  private nextId = 0
  private controllers = new Set<AbortController>()
  private _status: LlmStatus = { available: false, backend: 'none', modelLoaded: false, reason: 'not-started' }

  constructor(private readonly options: NativeRuntimeOptions) {}
  get status(): LlmStatus { return this._status }

  /**
   * Cheap pre-check, before any start: the configured model declares this task
   * and its file is installed. It never hashes the model; start() still verifies it.
   */
  canAttempt(mode: LlmAnalysisMode): boolean {
    return supportsModelTask(this.options.supportedTasks ?? ALL_LLM_ANALYSIS_MODES, mode)
      && existsSync(this.options.modelPath)
  }

  async start(): Promise<boolean> {
    // A cancellation stops this generation epoch, not the runtime permanently.
    // A caller that arrives while it is stopping waits and then starts cleanly.
    if (this.stopping) await this.stopping
    if (this.starting) return this.starting
    if (this.child && this._status.available) return true
    // Never overwrite a still-owned child handle. If it is unhealthy, require
    // its confirmed termination before a replacement can be spawned.
    if (this.child) await this.stopChild()
    const epoch = this.epoch
    this.starting = this.doStart(epoch).catch(async error => {
      console.warn('[llama.cpp]', error instanceof Error ? error.message : String(error))
      if (epoch === this.epoch) await this.stopChild()
      this._status = { available: false, backend: 'none', modelLoaded: false, reason: 'runtime-unavailable', error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240) }
      return false
    })
    try { return await this.starting } finally { this.starting = null }
  }

  private async doStart(epoch: number): Promise<boolean> {
    const o = this.options
    if (!existsSync(o.modelPath) || !existsSync(o.serverPath)) { this._status = { available: false, backend: 'none', modelLoaded: false, reason: 'model-missing' }; throw new Error('Local model or native runtime missing') }
    if (await sha256(o.modelPath) !== o.modelSha256) throw new Error('Model SHA256 mismatch')
    const port = await availablePort()
    if (epoch !== this.epoch) return false
    const layers = o.gpuLayers ?? 0
    if (!Number.isInteger(layers) || layers < 0 || layers > 999) throw new Error('Invalid GPU layer count')
    const logPath = typeof o.logPath === 'function' ? o.logPath() : o.logPath
    let log: number | undefined
    if (logPath) { mkdirSync(dirname(logPath), { recursive: true }); log = openSync(logPath, 'a') }
    let child: ChildProcess
    this.apiKey = randomBytes(32).toString('hex')
    try {
      child = spawn(o.serverPath, [
        '--model', o.modelPath, '--alias', 'cellsentry-cancel2',
        '--host', '127.0.0.1', '--port', String(port), '--ctx-size', String(AUDIT_CONTEXT_WINDOW_TOKENS),
        '--parallel', '1', '--n-gpu-layers', String(layers), '--cache-ram', '0',
        '--no-context-shift', '--reasoning', 'off', '--reasoning-format', 'auto',
        '--reasoning-budget', '-1', '--jinja',
        '--api-key', this.apiKey,
      ], { cwd: dirname(o.serverPath), windowsHide: true,
        stdio: ['ignore', log ?? 'ignore', log ?? 'ignore'] })
    } finally { if (log !== undefined) closeSync(log) }
    // Shutdown can race port allocation/spawn. Do not publish a child created
    // by an obsolete epoch; terminate it before returning to the caller.
    if (epoch !== this.epoch) {
      await this.terminateChild(child)
      return false
    }
    this.child = child
    this.url = `http://127.0.0.1:${port}`
    let failed = false
    const markUnavailable = (): void => {
      failed = true
      if (this.child === child) {
        this._status = { available: false, backend: 'none', modelLoaded: false, reason: 'runtime-unavailable' }
        for (const controller of this.controllers) controller.abort()
      }
    }
    const onExit = (): void => {
      markUnavailable()
      // Exit, unlike an error event, confirms the process no longer owns a
      // native runtime. It is the only normal path that releases this handle.
      if (this.child === child) this.child = null
    }
    const onError = (): void => {
      markUnavailable()
      // spawn failures have no child process to retry. A running child can
      // emit error before exit, so retain its handle for shutdown retry.
      if (this.child === child && !child.pid) this.child = null
    }
    child.once('error', onError)
    child.once('exit', onExit)
    const deadline = Date.now() + (o.timeoutMs ?? 120_000)
    while (Date.now() < deadline && !failed && epoch === this.epoch) {
      try {
        const health = await this.http('/health', undefined, 1000) as { status?: string }
        if (health.status === 'ok' && !failed && this.child === child) {
          const props = await this.http('/props', undefined, 1000) as { model_path?: string }
          if (!props.model_path || resolve(props.model_path) !== resolve(o.modelPath)) throw new Error('Unexpected local model')
          if (epoch !== this.epoch || failed) return false
          this._status = { available: true, backend: 'llama.cpp', modelLoaded: true, modelName: o.modelName }
          return true
        }
      } catch { /* the server returns 503 until loading finishes */ }
      await delay(100)
    }
    if (epoch !== this.epoch) {
      if (this.child === child) await this.stopChild()
      else await this.terminateChild(child)
      return false
    }
    throw new Error('Native runtime failed to start; inspect llama-server.log')
  }

  private async http(path: string, body?: unknown, timeoutMs = 180_000): Promise<unknown> {
    const controller = new AbortController()
    this.controllers.add(controller)
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      // Electron's net stack uses the application's existing proxy resolution.
      // Do not substitute node:http here: it connects loopback directly and
      // bypasses the inherited HTTP(S) proxy policy.
      const { net } = await import('electron')
      if (controller.signal.aborted) {
        throw new Error(timedOut ? 'Inference request timed out' : 'Inference request cancelled')
      }
      return await new Promise((resolve, reject) => {
        const req = net.request({ url: this.url + path, method: body === undefined ? 'GET' : 'POST' })
        let settled = false
        const abortError = (): Error => new Error(timedOut ? 'Inference request timed out' : 'Inference request cancelled')
        const cleanup = (): void => controller.signal.removeEventListener('abort', onAbort)
        const fail = (error: unknown): void => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        }
        const succeed = (value: unknown): void => {
          if (settled) return
          settled = true
          cleanup()
          resolve(value)
        }
        const onAbort = (): void => {
          // ClientRequest emits "abort" rather than reliably emitting "error".
          // Reject here so shutdown cannot wait forever on a pending HTTP request.
          req.abort()
          fail(abortError())
        }
        req.setHeader('Content-Type', 'application/json')
        req.setHeader('Authorization', `Bearer ${this.apiKey}`)
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) { onAbort(); return }
        req.on('abort', () => fail(abortError()))
        req.on('response', res => {
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            if (settled) return
            size += chunk.length
            if (size > 4_000_000) {
              req.abort()
              fail(new Error('Inference response too large'))
            } else chunks.push(chunk)
          })
          res.on('aborted', () => fail(abortError()))
          res.on('error', fail)
          res.on('end', () => {
            if (settled) return
            if (res.statusCode !== 200) { fail(new Error(`llama.cpp HTTP ${res.statusCode}`)); return }
            try { succeed(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { fail(error) }
          })
        })
        req.on('error', fail)
        req.end(body === undefined ? undefined : JSON.stringify(body))
      })
    } finally { clearTimeout(timer); this.controllers.delete(controller) }
  }

  private async ensureAuditPromptFits(messages: ChatMessage[], epoch: number): Promise<void> {
    const templateRequest = { messages, chat_template_kwargs: { enable_thinking: false } }
    // This is a byte safety valve, not token accounting. It prevents a huge
    // cell/formula from creating an unbounded local IPC payload before the
    // server's tokenizer can give an authoritative count.
    if (Buffer.byteLength(JSON.stringify(templateRequest), 'utf8') > AUDIT_MAX_TEMPLATE_BYTES) {
      throw new Error('Audit prompt exceeds local payload safety limit; deterministic finding preserved')
    }
    const template = await this.http('/apply-template', templateRequest, this.options.timeoutMs ?? 180_000) as { prompt?: unknown }
    if (epoch !== this.epoch) throw new Error('Inference cancelled')
    if (typeof template.prompt !== 'string' || !template.prompt.trim()) throw new Error('Audit prompt preflight failed: server did not return a non-empty template prompt')
    const tokenized = await this.http('/tokenize', {
      content: template.prompt,
      add_special: false,
      parse_special: true,
    }, this.options.timeoutMs ?? 180_000) as { tokens?: unknown }
    if (epoch !== this.epoch) throw new Error('Inference cancelled')
    if (!Array.isArray(tokenized.tokens) || tokenized.tokens.length === 0
      || !tokenized.tokens.every((token) => Number.isSafeInteger(token) && token >= 0)) {
      throw new Error('Audit prompt preflight failed: server did not return non-empty safe token IDs')
    }
    const required = tokenized.tokens.length + AUDIT_MAX_OUTPUT_TOKENS + AUDIT_TOKEN_MARGIN
    if (required > AUDIT_CONTEXT_WINDOW_TOKENS) {
      throw new Error(`Audit prompt exceeds context budget (${tokenized.tokens.length} input + ${AUDIT_MAX_OUTPUT_TOKENS} output reserve + ${AUDIT_TOKEN_MARGIN} margin > ${AUDIT_CONTEXT_WINDOW_TOKENS}); deterministic finding preserved`)
    }
  }

  private async generate(messages: ChatMessage[]): Promise<string> {
    const value = await this.http('/v1/chat/completions', {
      model: 'cellsentry-cancel2', messages, temperature: 0, seed: 42, max_tokens: AUDIT_MAX_OUTPUT_TOKENS,
      chat_template_kwargs: { enable_thinking: false },
    }, this.options.timeoutMs ?? 180_000) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> }
    const choice = value.choices?.[0]
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('Incomplete inference response')
    return choice.message.content
  }

  async send(request: Omit<LlmRequest, 'id'>): Promise<LlmResponse> {
    const id = ++this.nextId
    const epoch = this.epoch
    const params = request.params ?? {}
    const mode = params.mode ?? 'audit'
    const supportedTasks = this.options.supportedTasks ?? ALL_LLM_ANALYSIS_MODES
    // Do this before joining the serialized queue. An unsupported sidecar
    // operation must not wait behind a long formula request before its
    // deterministic fallback can complete.
    if (request.method === 'analyze' && !supportsModelTask(supportedTasks, mode)) {
      return { id, error: unsupportedTaskReason(this.options.modelName, supportedTasks, mode) }
    }
    const operation = this.queue.then(async (): Promise<LlmResponse> => {
      try {
        if (epoch !== this.epoch) throw new Error('Inference cancelled')
        if (request.method === 'shutdown') { await this.shutdown(); return { id, result: {} } }
        if (!await this.start() || epoch !== this.epoch) throw new Error('Native runtime unavailable')
        if (request.method === 'status') return { id, result: { status: this.status } }
        if (mode === 'audit') {
          const judgments = []
          for (const issue of params.issues ?? []) {
            if (epoch !== this.epoch) throw new Error('Inference cancelled')
            const messages: ChatMessage[] = [{ role: 'system', content: 'You are a spreadsheet formula auditor.' },
              { role: 'user', content: buildAuditPrompt([{ ...issue, context: issue.context ?? '' }]) }]
            await this.ensureAuditPromptFits(messages, epoch)
            if (epoch !== this.epoch) throw new Error('Inference cancelled')
            const raw = await this.generate(messages)
            if (epoch !== this.epoch) throw new Error('Inference cancelled')
            try { judgments.push(...parseAudit(raw, issue)) } catch (error) {
              throw new Error(`Invalid audit model response: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          return { id, result: { judgments } }
        }
        const cells = params.cells ?? []
        const addresses = new Set(cells.map(c => c.address))
        const raw = await this.generate(mode === 'pii' ? buildPiiMessages(cells) : buildExtractionMessages(cells))
        return { id, result: mode === 'pii' ? { findings: parsePii(raw, addresses) }
          : { extraction: parseExtraction(raw, addresses) } }
      } catch (e) { return { id, error: e instanceof Error ? e.message : String(e) } }
    })
    this.queue = operation.catch(() => {})
    return operation
  }

  private async stopChild(): Promise<void> {
    const child = this.child
    if (!child) {
      this._status = { available: false, backend: 'none', modelLoaded: false, reason: 'stopped' }
      return
    }
    await this.terminateChild(child)
    // Do not discard a still-live handle if SIGTERM/SIGKILL reporting failed:
    // shutdown can be retried and start() must not spawn over it.
    if (this.child === child) {
      this.child = null
      this._status = { available: false, backend: 'none', modelLoaded: false, reason: 'stopped' }
    }
  }

  private async terminateChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let killTimer: ReturnType<typeof setTimeout> | undefined
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(termTimer)
        if (killTimer) clearTimeout(killTimer)
        if (error) reject(error)
        else resolve()
      }
      const onExit = (): void => finish()
      const termTimer = setTimeout(() => {
        child.kill('SIGKILL')
        // SIGKILL must still be observed as an exit before shutdown completes.
        killTimer = setTimeout(() => finish(new Error('Native runtime did not exit after SIGKILL')), 3000)
      }, 3000)
      child.once('exit', onExit)
      child.once('error', error => finish(error instanceof Error ? error : new Error(String(error))))
      child.kill('SIGTERM')
    })
  }

  async shutdown(): Promise<void> {
    if (this.stopping) return this.stopping
    this.epoch++
    for (const controller of this.controllers) controller.abort()
    const pendingStart = this.starting
    this.stopping = (async () => {
      await this.stopChild()
      await pendingStart?.catch(() => {})
      // A start may have published its child between the first stop and the
      // await above. A second idempotent stop closes that race.
      await this.stopChild()
    })()
    try { await this.stopping } finally { this.stopping = null }
  }
}
