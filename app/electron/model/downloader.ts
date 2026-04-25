/**
 * ModelDownloader — fetches AI model weights from a region-aware URL list.
 *
 * v2.0 refactor (W1 Step 1.3 / AD10):
 *   - `ModelInfo` is now a discriminated union `SingleFileModel | DirectoryModel`.
 *   - SingleFileModel preserves the v1 GGUF shape (still works for any orphaned
 *     v1 disk file the user wants to verify) but is no longer the default; v1
 *     `DEFAULT_MODEL` constant is deleted.
 *   - DirectoryModel iterates a `files: ModelFile[]` list, downloading each
 *     entry to a subdirectory under `targetDir` with per-file sha256
 *     verification and aggregate progress.
 *   - Locale routing (HF / hf-mirror.com / ModelScope) preserved from v1, with
 *     the same priority: zh-CN → MS → mirror → HF; otherwise HF → mirror → MS.
 *   - Pure helpers (`buildUrls*`, `aggregateModelSize`, `checkModelOnDisk`) are
 *     module-exported so vitest can cover them without network.
 *
 * Platform-split HTTP (preserved from v1, see ROADMAP 2026-03-17 entry):
 *   - macOS uses Electron `net.request()` (Chromium stack, system-proxy aware)
 *   - Windows / Linux use Node.js `https`/`http` (works on corporate networks
 *     where Chromium fails)
 */

import { net } from 'electron'
import https from 'https'
import http from 'http'
import { createHash } from 'crypto'
import {
  createWriteStream,
  existsSync, statSync, statfsSync, unlinkSync, renameSync, mkdirSync
} from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types — discriminated union
// ---------------------------------------------------------------------------

interface ModelMeta {
  /** Display name for UI / logs. */
  name: string
  version: string
  description: string
}

export interface SingleFileModel extends ModelMeta {
  kind: 'single-file'
  filename: string
  size: number
  sha256: string
  /** Primary URL — typically HuggingFace. */
  downloadUrl: string
  /** Optional fallback (e.g. hf-mirror.com). */
  mirrorUrl?: string
  /** Optional China-primary URL (e.g. ModelScope). */
  cnPrimaryUrl?: string
}

export interface ModelFile {
  /** Path relative to the model directory (e.g. `config.json` or `model-00001-of-00003.safetensors`). */
  path: string
  size: number
  sha256: string
}

export interface DirectoryModel extends ModelMeta {
  kind: 'directory'
  /** Subdirectory name under `targetDir` where files land (e.g. `deepseek-ocr-8bit`). */
  localDirName: string
  files: ModelFile[]
  /** Sum of `files[].size`. Cached to avoid recomputing on every progress emit. */
  aggregateSize: number
  baseUrls: {
    /** HuggingFace base — required. Each file URL = `${hf}/${file.path}`. */
    hf: string
    /** hf-mirror.com base — optional global fallback. */
    mirror?: string
    /** ModelScope base — optional China primary. */
    ms?: string
  }
}

export type ModelInfo = SingleFileModel | DirectoryModel

// ---------------------------------------------------------------------------
// Pure helpers (no I/O — covered by vitest)
// ---------------------------------------------------------------------------

/**
 * Locale-aware URL ordering for a single-file model.
 * - `zh-*` locale: prefer cnPrimaryUrl (MS) → mirror → main (HF)
 * - other:         prefer downloadUrl (HF) → mirror → cnPrimaryUrl (MS)
 */
export function buildUrlsForSingleFile(model: SingleFileModel, locale: string): string[] {
  const isChinese = locale.startsWith('zh')
  const urls: string[] = []
  if (isChinese) {
    if (model.cnPrimaryUrl) urls.push(model.cnPrimaryUrl)
    if (model.mirrorUrl) urls.push(model.mirrorUrl)
    urls.push(model.downloadUrl)
  } else {
    urls.push(model.downloadUrl)
    if (model.mirrorUrl) urls.push(model.mirrorUrl)
    if (model.cnPrimaryUrl) urls.push(model.cnPrimaryUrl)
  }
  return urls
}

/**
 * Locale-aware URL ordering for one file inside a directory model.
 * Each base URL gets `/${file.path}` appended.
 */
export function buildUrlsForDirectoryFile(
  model: DirectoryModel,
  file: ModelFile,
  locale: string,
): string[] {
  const isChinese = locale.startsWith('zh')
  const urls: string[] = []
  const append = (base?: string): void => {
    if (base) urls.push(`${base.replace(/\/+$/, '')}/${file.path.replace(/^\/+/, '')}`)
  }
  if (isChinese) {
    append(model.baseUrls.ms)
    append(model.baseUrls.mirror)
    append(model.baseUrls.hf)
  } else {
    append(model.baseUrls.hf)
    append(model.baseUrls.mirror)
    append(model.baseUrls.ms)
  }
  return urls
}

/** Total bytes the user must download to fully install the model. */
export function aggregateModelSize(model: ModelInfo): number {
  if (model.kind === 'single-file') return model.size
  return model.files.reduce((acc, f) => acc + f.size, 0)
}

/**
 * On-disk completeness check. For directory models, returns true iff every
 * `files[]` entry exists at expected size. Empty `files: []` → vacuously true,
 * which is the W1 placeholder behavior (registry hasn't filled in real data
 * yet, app launches without download flow until W2 swaps in real metadata).
 */
export function checkModelOnDisk(model: ModelInfo, targetDir: string): boolean {
  if (model.kind === 'single-file') {
    const path = join(targetDir, model.filename)
    if (!existsSync(path)) return false
    const sz = statSync(path).size
    return model.size > 0 ? sz === model.size : true
  }
  // directory
  for (const f of model.files) {
    const path = join(targetDir, model.localDirName, f.path)
    if (!existsSync(path)) return false
    const sz = statSync(path).size
    if (f.size > 0 && sz !== f.size) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

interface DownloadResponse {
  statusCode?: number
  headers: Record<string, unknown>
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  on(event: 'end', listener: () => void): unknown
  on(event: 'error', listener: (err: unknown) => void): unknown
}

interface FileTask {
  /** Absolute path of the .downloading temp file. */
  tempPath: string
  /** Absolute path of the final file location. */
  finalPath: string
  /** Expected total bytes (informational; servers may return different). */
  expectedSize: number
  /** Hex sha256, lowercase. Empty string skips verification. */
  expectedSha256: string
  /** Human-readable label for progress messages. */
  label: string
}

export type ProgressCallback = (downloaded: number, total: number, message: string) => void

export class ModelDownloader {
  private readonly targetDir: string
  private readonly modelInfo: ModelInfo
  private readonly locale: string
  private progressCallback: ProgressCallback | null = null
  private cancelled = false
  private _downloadPromise: Promise<boolean> | null = null
  private _currentRequest: Electron.ClientRequest | http.ClientRequest | null = null
  /** For directory mode: bytes already downloaded across completed files. */
  private _aggregateOffset = 0

  constructor(targetDir: string, modelInfo: ModelInfo, locale?: string) {
    this.targetDir = targetDir
    this.modelInfo = modelInfo
    this.locale = locale || 'en'
  }

  setProgressCallback(cb: ProgressCallback): void {
    this.progressCallback = cb
  }

  cancel(): void {
    this.cancelled = true
    if (this._currentRequest) {
      this._currentRequest.abort()
      this._currentRequest = null
    }
  }

  /** Path the user-visible model lives at on disk (file or directory). */
  getModelLocalPath(): string {
    if (this.modelInfo.kind === 'single-file') {
      return join(this.targetDir, this.modelInfo.filename)
    }
    return join(this.targetDir, this.modelInfo.localDirName)
  }

  checkModelExists(): boolean {
    return checkModelOnDisk(this.modelInfo, this.targetDir)
  }

  async download(): Promise<boolean> {
    if (this._downloadPromise) return this._downloadPromise
    this._downloadPromise = this._dispatchDownload()
    try {
      return await this._downloadPromise
    } finally {
      this._downloadPromise = null
    }
  }

  // ── Dispatch by kind ───────────────────────────────────────────────────

  private async _dispatchDownload(): Promise<boolean> {
    if (!this.checkDiskSpace()) {
      throw new Error('Insufficient disk space.')
    }
    if (this.modelInfo.kind === 'single-file') {
      return this._downloadSingleFile(this.modelInfo)
    }
    return this._downloadDirectory(this.modelInfo)
  }

  private async _downloadSingleFile(model: SingleFileModel): Promise<boolean> {
    this._aggregateOffset = 0
    const urls = buildUrlsForSingleFile(model, this.locale)
    const task: FileTask = {
      tempPath: join(this.targetDir, `${model.filename}.downloading`),
      finalPath: join(this.targetDir, model.filename),
      expectedSize: model.size,
      expectedSha256: model.sha256,
      label: model.filename,
    }
    return this._downloadOneFileWithFallback(urls, task, model.size)
  }

  private async _downloadDirectory(model: DirectoryModel): Promise<boolean> {
    if (model.files.length === 0) {
      // Registry placeholder — W1 default state. Treat as no-op success so
      // the app can launch without forcing the user through a download flow
      // that has no real data behind it.
      this.emitProgress(0, 0,
        'v2 model registry has no files yet (W2 fills this in after AD9 verification).')
      return true
    }

    mkdirSync(join(this.targetDir, model.localDirName), { recursive: true })
    this._aggregateOffset = 0

    for (const file of model.files) {
      if (this.cancelled) return false
      const urls = buildUrlsForDirectoryFile(model, file, this.locale)
      const subDir = join(this.targetDir, model.localDirName)
      // Mirror nested paths (e.g. "tokenizer/added_tokens.json").
      const finalPath = join(subDir, file.path)
      const fileDir = join(finalPath, '..')
      mkdirSync(fileDir, { recursive: true })

      const task: FileTask = {
        tempPath: `${finalPath}.downloading`,
        finalPath,
        expectedSize: file.size,
        expectedSha256: file.sha256,
        label: `${model.localDirName}/${file.path}`,
      }
      const ok = await this._downloadOneFileWithFallback(urls, task, model.aggregateSize)
      if (!ok) return false
      this._aggregateOffset += file.size
    }

    this.emitProgress(model.aggregateSize, model.aggregateSize, 'Download complete')
    return true
  }

  // ── Single-file download with URL-list fallback + retry ────────────────

  private async _downloadOneFileWithFallback(
    urls: string[],
    task: FileTask,
    aggregateTotal: number,
  ): Promise<boolean> {
    let lastError: Error | undefined

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      const MAX_RETRIES = 2
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await this._fetchOneFile(url, task, aggregateTotal)
        } catch (err) {
          if (this.cancelled) return false
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt === MAX_RETRIES) break
          const delay = Math.pow(2, attempt) * 1000
          this.emitProgress(this._aggregateOffset, aggregateTotal,
            `Network error on ${task.label}. Retrying in ${delay / 1000}s…`)
          await new Promise(r => setTimeout(r, delay))
        }
      }
      this.cleanupTask(task)
      if (i < urls.length - 1) {
        this.emitProgress(this._aggregateOffset, aggregateTotal, 'Switching to next source…')
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    throw lastError || new Error(`Download failed: ${task.label}`)
  }

  private async _fetchOneFile(url: string, task: FileTask, aggregateTotal: number): Promise<boolean> {
    if (process.platform === 'darwin') {
      return this._fetchOneFileNet(url, task, aggregateTotal)
    }
    return this._fetchOneFileNode(url, task, aggregateTotal)
  }

  /** macOS: use Electron net module (proxy-aware). */
  private _fetchOneFileNet(url: string, task: FileTask, aggregateTotal: number): Promise<boolean> {
    this.cancelled = false

    let resumePos = 0
    try {
      if (existsSync(task.tempPath)) {
        resumePos = statSync(task.tempPath).size
      }
    } catch { /* ignore */ }

    this.emitProgress(this._aggregateOffset + resumePos, aggregateTotal, `Connecting (${task.label})…`)

    return new Promise((resolve, reject) => {
      const req = net.request({ method: 'GET', url, redirect: 'follow' })
      req.setHeader('User-Agent', 'CellSentry/2.0')
      if (resumePos > 0) req.setHeader('Range', `bytes=${resumePos}-`)

      this._currentRequest = req

      const connectTimeout = setTimeout(() => {
        req.abort()
        reject(new Error('Connection timed out'))
      }, 15_000)

      req.on('response', (response) => {
        clearTimeout(connectTimeout)
        this._handleResponse(response, task, resumePos, aggregateTotal, resolve, reject)
      })
      req.on('error', (err: Error) => {
        clearTimeout(connectTimeout)
        reject(new Error(`Request error: ${err.message}`))
      })
      req.end()
    })
  }

  /** Windows / Linux: Node.js https.get() with manual redirect-follow. */
  private async _fetchOneFileNode(url: string, task: FileTask, aggregateTotal: number): Promise<boolean> {
    this.cancelled = false

    let resumePos = 0
    try {
      if (existsSync(task.tempPath)) {
        resumePos = statSync(task.tempPath).size
      }
    } catch { /* ignore */ }

    this.emitProgress(this._aggregateOffset + resumePos, aggregateTotal, `Connecting (${task.label})…`)

    let currentUrl = url
    for (let redirects = 0; redirects < 5; redirects++) {
      const result = await this._nodeRequest(currentUrl, resumePos, task, aggregateTotal)
      if (result.redirect) {
        currentUrl = result.redirectUrl!
        continue
      }
      return result.success
    }
    throw new Error('Too many redirects')
  }

  private _nodeRequest(
    url: string,
    resumePos: number,
    task: FileTask,
    aggregateTotal: number,
  ): Promise<{ success: boolean; redirect?: boolean; redirectUrl?: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const transport = parsed.protocol === 'https:' ? https : http

      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'CellSentry/2.0',
          ...(resumePos > 0 ? { Range: `bytes=${resumePos}-` } : {}),
        },
      }

      const req = transport.get(options, (response) => {
        clearTimeout(connectTimeout)
        const statusCode = response.statusCode || 0

        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          response.resume()
          resolve({ success: false, redirect: true, redirectUrl: response.headers.location })
          return
        }

        this._handleResponse(response, task, resumePos, aggregateTotal,
          (success) => resolve({ success }),
          reject)
      })

      this._currentRequest = req

      const connectTimeout = setTimeout(() => {
        req.destroy()
        reject(new Error('Connection timed out'))
      }, 15_000)

      req.on('error', (err) => {
        clearTimeout(connectTimeout)
        reject(new Error(`Request error: ${err.message}`))
      })
    })
  }

  /** Shared response handler — drains body to disk, verifies sha256, renames temp → final. */
  private _handleResponse(
    response: DownloadResponse,
    task: FileTask,
    initialResumePos: number,
    aggregateTotal: number,
    resolve: (value: boolean) => void,
    reject: (reason: Error) => void,
  ): void {
    let resumePos = initialResumePos
    const statusCode = response.statusCode || 0

    if (resumePos > 0 && statusCode !== 206) {
      resumePos = 0
      try { unlinkSync(task.tempPath) } catch { /* ignore */ }
    }

    if (statusCode === 416) {
      // Range Not Satisfiable — already-complete temp file.
      if (existsSync(task.tempPath)) {
        renameSync(task.tempPath, task.finalPath)
        resolve(true)
      } else {
        reject(new Error('HTTP 416: Range Not Satisfiable'))
      }
      return
    }

    if (statusCode !== 200 && statusCode !== 206) {
      reject(new Error(`HTTP error ${statusCode}`))
      return
    }

    const contentLength = response.headers['content-length'] as string | undefined
    const expectedFileSize = contentLength
      ? parseInt(contentLength, 10) + resumePos
      : task.expectedSize

    let downloaded = resumePos
    const fileStream = createWriteStream(task.tempPath, {
      flags: resumePos > 0 ? 'a' : 'w',
    })

    response.on('data', (chunk: Buffer) => {
      if (this.cancelled) {
        fileStream.close()
        return
      }
      fileStream.write(chunk)
      downloaded += chunk.length
      const downloadedMB = (this._aggregateOffset + downloaded) / (1024 * 1024)
      const totalMB = (aggregateTotal || expectedFileSize) / (1024 * 1024)
      this.emitProgress(
        this._aggregateOffset + downloaded,
        aggregateTotal || expectedFileSize,
        `Downloading ${task.label}… ${downloadedMB.toFixed(1)} MB / ${totalMB.toFixed(1)} MB`,
      )
    })

    response.on('end', () => {
      fileStream.end(() => {
        if (this.cancelled) {
          resolve(false)
          return
        }

        if (task.expectedSha256) {
          this.emitProgress(this._aggregateOffset + downloaded, aggregateTotal,
            `Verifying ${task.label}…`)
          if (!verifyChecksumSync(task.tempPath, task.expectedSha256)) {
            try { unlinkSync(task.tempPath) } catch { /* ignore */ }
            reject(new Error(
              `Checksum mismatch for ${task.label} — expected sha256 ${task.expectedSha256.slice(0, 16)}…`))
            return
          }
        }

        if (existsSync(task.finalPath)) {
          try { unlinkSync(task.finalPath) } catch { /* ignore */ }
        }
        renameSync(task.tempPath, task.finalPath)
        resolve(true)
      })
    })

    response.on('error', (err: unknown) => {
      fileStream.close()
      const message = err instanceof Error ? err.message : String(err)
      reject(new Error(`Network error: ${message}`))
    })

    fileStream.on('error', (err) => {
      reject(new Error(`File write error: ${err.message}`))
    })
  }

  // ── Misc helpers ────────────────────────────────────────────────────────

  cleanupTask(task: FileTask): void {
    try {
      if (existsSync(task.tempPath)) unlinkSync(task.tempPath)
    } catch { /* ignore */ }
  }

  private checkDiskSpace(): boolean {
    try {
      mkdirSync(this.targetDir, { recursive: true })
      const stats = statfsSync(this.targetDir)
      const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize)
      const required = BigInt(Math.ceil(aggregateModelSize(this.modelInfo) * 1.1))
      return freeBytes >= required
    } catch {
      return true
    }
  }

  private emitProgress(downloaded: number, total: number, message: string): void {
    this.progressCallback?.(downloaded, total, message)
  }
}

// ---------------------------------------------------------------------------
// Module-level checksum helper (also used by tests on temp fixtures)
// ---------------------------------------------------------------------------

export function verifyChecksumSync(filePath: string, expectedSha256: string): boolean {
  if (!expectedSha256) return true
  const hash = createHash('sha256')
  const CHUNK_SIZE = 8192 * 1024
  for (const chunk of readChunksSync(filePath, CHUNK_SIZE)) {
    hash.update(chunk)
  }
  return hash.digest('hex').toLowerCase() === expectedSha256.toLowerCase()
}

function* readChunksSync(filePath: string, chunkSize: number): Generator<Buffer> {
  const { openSync, readSync, closeSync } = require('fs') as typeof import('fs')
  const fd = openSync(filePath, 'r')
  const buf = Buffer.alloc(chunkSize)
  try {
    let bytesRead: number
    while ((bytesRead = readSync(fd, buf, 0, chunkSize, null)) > 0) {
      yield buf.subarray(0, bytesRead)
    }
  } finally {
    closeSync(fd)
  }
}
