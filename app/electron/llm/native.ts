/** Owns one native llama-server and a serialized local request queue. */
import { spawn, type ChildProcess } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { createReadStream, existsSync, mkdirSync, openSync, closeSync } from 'fs'
import { dirname, resolve } from 'path'
import { createServer } from 'net'
import { setTimeout as delay } from 'timers/promises'
import { buildAuditPrompt, buildPiiMessages, buildExtractionMessages } from './prompts'
import { parseAudit, parsePii, parseExtraction } from './protocol'
import type { LlmRequest, LlmResponse, LlmStatus } from './types'

export interface NativeRuntimeOptions {
  serverPath: string
  modelPath: string
  modelSha256: string
  modelName: string
  gpuLayers?: number
  logPath?: string
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
  private queue: Promise<unknown> = Promise.resolve()
  private epoch = 0
  private nextId = 0
  private controllers = new Set<AbortController>()
  private _status: LlmStatus = { available: false, backend: 'none', modelLoaded: false }

  constructor(private readonly options: NativeRuntimeOptions) {}
  get status(): LlmStatus { return this._status }

  async start(): Promise<boolean> {
    if (this.starting) return this.starting
    if (this.child && this._status.available) return true
    const epoch = this.epoch
    this.starting = this.doStart(epoch).catch(async error => {
      console.warn('[llama.cpp]', error instanceof Error ? error.message : String(error))
      if (epoch === this.epoch) await this.stopChild()
      return false
    })
    try { return await this.starting } finally { this.starting = null }
  }

  private async doStart(epoch: number): Promise<boolean> {
    const o = this.options
    if (!existsSync(o.modelPath) || !existsSync(o.serverPath)) throw new Error('Local model or native runtime missing')
    if (await sha256(o.modelPath) !== o.modelSha256) throw new Error('Model SHA256 mismatch')
    const port = await availablePort()
    if (epoch !== this.epoch) return false
    const layers = o.gpuLayers ?? 0
    if (!Number.isInteger(layers) || layers < 0 || layers > 999) throw new Error('Invalid GPU layer count')
    let log: number | undefined
    if (o.logPath) { mkdirSync(dirname(o.logPath), { recursive: true }); log = openSync(o.logPath, 'a') }
    let child: ChildProcess
    this.apiKey = randomBytes(32).toString('hex')
    try {
      child = spawn(o.serverPath, [
        '--model', o.modelPath, '--alias', 'cellsentry-cancel2',
        '--host', '127.0.0.1', '--port', String(port), '--ctx-size', '1024',
        '--parallel', '1', '--n-gpu-layers', String(layers), '--cache-ram', '0',
        '--no-context-shift', '--reasoning', 'off', '--reasoning-format', 'auto',
        '--reasoning-budget', '-1', '--jinja',
        '--api-key', this.apiKey,
      ], { cwd: dirname(o.serverPath), windowsHide: true,
        stdio: ['ignore', log ?? 'ignore', log ?? 'ignore'] })
    } finally { if (log !== undefined) closeSync(log) }
    this.child = child
    this.url = `http://127.0.0.1:${port}`
    let failed = false
    const onExit = (): void => {
      failed = true
      if (this.child === child) {
        this.child = null
        this._status = { available: false, backend: 'none', modelLoaded: false }
        for (const controller of this.controllers) controller.abort()
      }
    }
    child.once('error', onExit)
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
    throw new Error('Native runtime failed to start; inspect llama-server.log')
  }

  private async http(path: string, body?: unknown, timeoutMs = 180_000): Promise<unknown> {
    const controller = new AbortController()
    this.controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // node:http addresses loopback directly without corporate/system proxies.
      const { request } = await import('http')
      return await new Promise((done, reject) => {
        const req = request(this.url + path, { method: body === undefined ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, signal: controller.signal }, res => {
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > 4_000_000) req.destroy(new Error('Inference response too large'))
            else chunks.push(chunk)
          })
          res.on('error', reject)
          res.on('end', () => {
            if (res.statusCode !== 200) { reject(new Error(`llama.cpp HTTP ${res.statusCode}`)); return }
            try { done(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { reject(e) }
          })
        })
        req.on('error', reject)
        req.end(body === undefined ? undefined : JSON.stringify(body))
      })
    } finally { clearTimeout(timer); this.controllers.delete(controller) }
  }

  private async generate(messages: Array<{ role: string; content: string }>): Promise<string> {
    const value = await this.http('/v1/chat/completions', {
      model: 'cellsentry-cancel2', messages, temperature: 0, seed: 42, max_tokens: 420,
      chat_template_kwargs: { enable_thinking: false },
    }, this.options.timeoutMs ?? 180_000) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> }
    const choice = value.choices?.[0]
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('Incomplete inference response')
    return choice.message.content
  }

  async send(request: Omit<LlmRequest, 'id'>): Promise<LlmResponse> {
    const id = ++this.nextId
    const epoch = this.epoch
    const operation = this.queue.then(async (): Promise<LlmResponse> => {
      try {
        if (epoch !== this.epoch) throw new Error('Inference cancelled')
        if (request.method === 'shutdown') { await this.shutdown(); return { id, result: {} } }
        if (!await this.start() || epoch !== this.epoch) throw new Error('Native runtime unavailable')
        if (request.method === 'status') return { id, result: { status: this.status } }
        const params = request.params ?? {}
        const mode = params.mode ?? 'audit'
        if (mode === 'audit') {
          const judgments = []
          for (const issue of params.issues ?? []) {
            if (epoch !== this.epoch) throw new Error('Inference cancelled')
            const raw = await this.generate([{ role: 'system', content: 'You are a spreadsheet formula auditor.' },
              { role: 'user', content: buildAuditPrompt([{ ...issue, context: issue.context ?? '' }]) }])
            try { judgments.push(...parseAudit(raw, issue)) } catch { /* retain original finding */ }
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
    this.child = null
    this._status = { available: false, backend: 'none', modelLoaded: false }
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>(done => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); done() }, 3000)
      child.once('exit', () => { clearTimeout(timer); done() })
      child.kill('SIGTERM')
    })
  }

  async shutdown(): Promise<void> {
    this.epoch++
    for (const controller of this.controllers) controller.abort()
    await this.stopChild()
    await this.starting
  }
}
