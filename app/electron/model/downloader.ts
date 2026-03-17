import { net } from 'electron'
import https from 'https'
import http from 'http'
import { createHash } from 'crypto'
import {
  createWriteStream,
  existsSync, statSync, statfsSync, unlinkSync, renameSync, mkdirSync
} from 'fs'
import { join } from 'path'

export interface ModelInfo {
  name: string
  filename: string
  version: string
  size: number
  sha256: string
  downloadUrl: string
  mirrorUrl?: string
  description: string
}

export const DEFAULT_MODEL: ModelInfo = {
  name: 'CellSentry 1.5B v3 Q4KM',
  filename: 'cellsentry-1.5b-v3-q4km.gguf',
  version: 'v3.0',
  size: 940 * 1024 * 1024,
  sha256: '4ae17b3886e4a5089671bf16aa133eaa6d8917a118bde6c75a54c1c3610f7cd3',
  downloadUrl: 'https://huggingface.co/almax000/cellsentry-model/resolve/main/cellsentry-1.5b-v3-q4km.gguf',
  mirrorUrl: 'https://hf-mirror.com/almax000/cellsentry-model/resolve/main/cellsentry-1.5b-v3-q4km.gguf',
  description: 'CellSentry multi-task model (audit + PII + extraction, Q4_K_M)'
}

export type ProgressCallback = (downloaded: number, total: number, message: string) => void

export class ModelDownloader {
  private targetDir: string
  private modelInfo: ModelInfo
  private progressCallback: ProgressCallback | null = null
  private cancelled = false
  private _downloadPromise: Promise<boolean> | null = null
  private _currentRequest: Electron.ClientRequest | http.ClientRequest | null = null

  constructor(targetDir: string, modelInfo?: ModelInfo) {
    this.targetDir = targetDir
    this.modelInfo = modelInfo || DEFAULT_MODEL
  }

  setProgressCallback(cb: ProgressCallback): void {
    this.progressCallback = cb
  }

  cancel(): void {
    this.cancelled = true
    if (this._currentRequest) {
      if ('abort' in this._currentRequest) {
        this._currentRequest.abort()
      } else {
        this._currentRequest.destroy()
      }
      this._currentRequest = null
    }
  }

  getModelPath(): string {
    return join(this.targetDir, this.modelInfo.filename)
  }

  checkModelExists(): boolean {
    const modelPath = this.getModelPath()
    if (!existsSync(modelPath)) return false
    const actualSize = statSync(modelPath).size
    return this.modelInfo.size > 0 ? actualSize === this.modelInfo.size : true
  }

  async download(): Promise<boolean> {
    // If already downloading, return the same promise (handles React StrictMode double-mount)
    if (this._downloadPromise) return this._downloadPromise
    this._downloadPromise = this._downloadWithRetry()
    try {
      return await this._downloadPromise
    } finally {
      this._downloadPromise = null
    }
  }

  private async _downloadWithRetry(): Promise<boolean> {
    if (!this.checkDiskSpace()) {
      throw new Error('Insufficient disk space. Need approximately 1 GB free.')
    }

    // Build URL list: primary first, then mirror if available
    const urls = [this.modelInfo.downloadUrl]
    if (this.modelInfo.mirrorUrl) urls.push(this.modelInfo.mirrorUrl)

    let lastError: Error | undefined
    for (const url of urls) {
      const isMirror = url !== this.modelInfo.downloadUrl
      const MAX_RETRIES = isMirror ? 3 : 2
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await this.doDownload(url)
        } catch (err) {
          if (this.cancelled) return false
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt === MAX_RETRIES) break
          const delay = Math.pow(2, attempt) * 1000
          this.emitProgress(0, this.modelInfo.size, `Network error. Retrying in ${delay / 1000}s...`)
          await new Promise(r => setTimeout(r, delay))
        }
      }
      // Clean up partial download before trying mirror
      this.cleanup()
      if (isMirror) break
      this.emitProgress(0, this.modelInfo.size, 'Switching to mirror...')
      await new Promise(r => setTimeout(r, 1000))
    }
    throw lastError || new Error('Download failed')
  }

  cleanup(): void {
    const tempPath = this.getTempPath()
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch { /* ignore */ }
  }

  private checkDiskSpace(): boolean {
    try {
      mkdirSync(this.targetDir, { recursive: true })
      const stats = statfsSync(this.targetDir)
      const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize)
      const required = BigInt(Math.ceil(this.modelInfo.size * 1.1))
      return freeBytes >= required
    } catch {
      return true
    }
  }

  private async doDownload(url: string): Promise<boolean> {
    // macOS: use Electron net module (respects system proxy)
    // Windows: use Node.js https (more compatible with corporate environments)
    if (process.platform === 'darwin') {
      return this.doDownloadNet(url)
    }
    return this.doDownloadNode(url)
  }

  /** Download using Electron's net module (Chromium stack, proxy-aware) */
  private async doDownloadNet(url: string): Promise<boolean> {
    this.cancelled = false
    mkdirSync(this.targetDir, { recursive: true })

    const tempPath = this.getTempPath()
    const finalPath = this.getModelPath()

    let resumePos = 0
    try {
      if (existsSync(tempPath)) {
        resumePos = statSync(tempPath).size
      }
    } catch { /* file may have been renamed between check and stat */ }

    this.emitProgress(resumePos, this.modelInfo.size, 'Connecting...')

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': 'CellSentry/1.0'
      }
      if (resumePos > 0) {
        headers['Range'] = `bytes=${resumePos}-`
      }

      const req = net.request({
        method: 'GET',
        url,
        redirect: 'follow',
      })

      for (const [key, value] of Object.entries(headers)) {
        req.setHeader(key, value)
      }

      this._currentRequest = req

      const connectTimeout = setTimeout(() => {
        req.abort()
        reject(new Error('Connection timed out'))
      }, 15_000)

      req.on('response', (response) => {
        clearTimeout(connectTimeout)
        this.handleResponse(response, tempPath, finalPath, resumePos, resolve, reject)
      })

      req.on('error', (err: Error) => {
        clearTimeout(connectTimeout)
        reject(new Error(`Request error: ${err.message}`))
      })

      req.end()
    })
  }

  /** Download using Node.js https (works on Windows with corporate/restrictive networks) */
  private async doDownloadNode(url: string): Promise<boolean> {
    this.cancelled = false
    mkdirSync(this.targetDir, { recursive: true })

    const tempPath = this.getTempPath()
    const finalPath = this.getModelPath()

    let resumePos = 0
    try {
      if (existsSync(tempPath)) {
        resumePos = statSync(tempPath).size
      }
    } catch { /* file may have been renamed between check and stat */ }

    this.emitProgress(resumePos, this.modelInfo.size, 'Connecting...')

    // Follow redirects manually (up to 5)
    let currentUrl = url
    for (let redirects = 0; redirects < 5; redirects++) {
      const result = await this.nodeRequest(currentUrl, resumePos, tempPath, finalPath)
      if (result.redirect) {
        currentUrl = result.redirectUrl!
        continue
      }
      return result.success
    }
    throw new Error('Too many redirects')
  }

  private nodeRequest(
    url: string,
    resumePos: number,
    tempPath: string,
    finalPath: string
  ): Promise<{ success: boolean; redirect?: boolean; redirectUrl?: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const transport = parsed.protocol === 'https:' ? https : http

      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'CellSentry/1.0',
          ...(resumePos > 0 ? { Range: `bytes=${resumePos}-` } : {}),
        },
      }

      const req = transport.get(options, (response) => {
        clearTimeout(connectTimeout)
        const statusCode = response.statusCode || 0

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          response.resume()
          resolve({ success: false, redirect: true, redirectUrl: response.headers.location })
          return
        }

        this.handleResponse(response, tempPath, finalPath, resumePos,
          (success) => resolve({ success }),
          reject
        )
      })

      this._currentRequest = req

      // Hard connection timeout — GFW may silently drop SYN packets
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

  /** Shared response handler for both net and https transports */
  private handleResponse(
    response: { statusCode: number; headers: Record<string, unknown>; on: (event: string, cb: (...args: unknown[]) => void) => void },
    tempPath: string,
    finalPath: string,
    resumePos: number,
    resolve: (value: boolean) => void,
    reject: (reason: Error) => void
  ): void {
    const statusCode = response.statusCode

    // Resume not supported — restart from scratch
    if (resumePos > 0 && statusCode !== 206) {
      resumePos = 0
      try { unlinkSync(tempPath) } catch { /* ignore */ }
    }

    if (statusCode === 416) {
      if (existsSync(tempPath)) {
        renameSync(tempPath, finalPath)
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
    const totalSize = contentLength
      ? parseInt(contentLength, 10) + resumePos
      : this.modelInfo.size

    let downloaded = resumePos
    const fileStream = createWriteStream(tempPath, {
      flags: resumePos > 0 ? 'a' : 'w'
    })

    response.on('data', (chunk: Buffer) => {
      if (this.cancelled) {
        fileStream.close()
        return
      }
      fileStream.write(chunk)
      downloaded += chunk.length
      const downloadedMB = downloaded / (1024 * 1024)
      const totalMB = totalSize / (1024 * 1024)
      this.emitProgress(
        downloaded,
        totalSize,
        `Downloading... ${downloadedMB.toFixed(1)} MB / ${totalMB.toFixed(1)} MB`
      )
    })

    response.on('end', () => {
      fileStream.end(() => {
        if (this.cancelled) {
          resolve(false)
          return
        }

        if (this.modelInfo.sha256) {
          this.emitProgress(downloaded, totalSize, 'Verifying checksum...')
          if (!this.verifyChecksumSync(tempPath)) {
            try { unlinkSync(tempPath) } catch { /* ignore */ }
            reject(new Error('Checksum verification failed'))
            return
          }
        }

        if (existsSync(finalPath)) {
          try { unlinkSync(finalPath) } catch { /* ignore */ }
        }
        renameSync(tempPath, finalPath)
        this.emitProgress(totalSize, totalSize, 'Download complete')
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

  private getTempPath(): string {
    return join(this.targetDir, `${this.modelInfo.filename}.downloading`)
  }

  private emitProgress(downloaded: number, total: number, message: string): void {
    this.progressCallback?.(downloaded, total, message)
  }

  private verifyChecksumSync(filePath: string): boolean {
    if (!this.modelInfo.sha256) return true

    const hash = createHash('sha256')
    const totalSize = statSync(filePath).size
    const CHUNK_SIZE = 8192 * 1024 // 8MB

    for (const chunk of readChunksSync(filePath, CHUNK_SIZE)) {
      hash.update(chunk)
    }

    this.emitProgress(totalSize, totalSize, 'Verified')
    return hash.digest('hex').toLowerCase() === this.modelInfo.sha256.toLowerCase()
  }
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
