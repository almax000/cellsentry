import { net } from 'electron'
import { createHash } from 'crypto'
import {
  createWriteStream, type WriteStream,
  existsSync, statSync, statfsSync, unlinkSync, renameSync, mkdirSync
} from 'fs'
import { join } from 'path'
import { ModelDownloadHttpError, ModelDownloadNotConfiguredError, isUnavailableDownloadSource } from './downloadFailure'

/** Minimal response interface compatible with both Electron net and Node.js http */
interface DownloadResponse {
  statusCode?: number
  headers: Record<string, unknown>
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  on(event: 'end', listener: () => void): unknown
  on(event: 'error', listener: (err: unknown) => void): unknown
  destroy?: () => void
  pause?: () => void
  resume?: () => void
}

import { DEFAULT_MODEL, type ModelInfo } from './catalog'
export { DEFAULT_MODEL, type ModelInfo } from './catalog'

export type ProgressCallback = (downloaded: number, total: number, message: string) => void

export class ModelDownloader {
  private targetDir: string
  private modelInfo: ModelInfo
  private locale: string
  private progressCallback: ProgressCallback | null = null
  private cancelled = false
  private _downloadPromise: Promise<boolean> | null = null
  private _currentRequest: Electron.ClientRequest | null = null
  private _currentResponse: DownloadResponse | null = null
  private _activeStream: WriteStream | null = null
  private _cancelDownload: (() => void) | null = null
  private _retryWake: (() => void) | null = null

  constructor(targetDir: string, modelInfo?: ModelInfo, locale?: string) {
    this.targetDir = targetDir
    this.modelInfo = modelInfo || DEFAULT_MODEL
    this.locale = locale || 'en'
  }

  setProgressCallback(cb: ProgressCallback): void {
    this.progressCallback = cb
  }

  cancel(): void {
    this.cancelled = true
    this._cancelDownload?.()
    this._activeStream?.destroy()
    this._activeStream = null
    if (this._currentRequest) {
      this._currentRequest.abort()
      this._currentRequest = null
    }
    this._currentResponse?.destroy?.()
    this._currentResponse = null
    this._retryWake?.()
    this._retryWake = null
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
    if (!this.canDownload()) throw new ModelDownloadNotConfiguredError()
    // If already downloading, return the same promise (handles React StrictMode double-mount)
    if (this._downloadPromise) return this._downloadPromise
    this.cancelled = false
    this._downloadPromise = this._downloadWithRetry()
    try {
      return await this._downloadPromise
    } finally {
      this._downloadPromise = null
    }
  }

  canDownload(): boolean {
    return this.buildUrlList().length > 0
  }

  private buildUrlList(): string[] {
    const isChinese = this.locale.startsWith('zh')
    if (isChinese) {
      const urls: string[] = []
      if (this.modelInfo.cnPrimaryUrl) urls.push(this.modelInfo.cnPrimaryUrl)
      if (this.modelInfo.mirrorUrl) urls.push(this.modelInfo.mirrorUrl)
      if (this.modelInfo.downloadUrl) urls.push(this.modelInfo.downloadUrl)
      return urls
    }
    const urls: string[] = this.modelInfo.downloadUrl ? [this.modelInfo.downloadUrl] : []
    if (this.modelInfo.mirrorUrl) urls.push(this.modelInfo.mirrorUrl)
    if (this.modelInfo.cnPrimaryUrl) urls.push(this.modelInfo.cnPrimaryUrl)
    return urls
  }

  private async _downloadWithRetry(): Promise<boolean> {
    if (!this.checkDiskSpace()) {
      throw new Error(`Insufficient disk space for the ${Math.ceil(this.modelInfo.size / 1_000_000)} MB model.`)
    }

    const urls = this.buildUrlList()
    let lastError: Error | undefined

    for (let i = 0; i < urls.length; i++) {
      if (this.cancelled) return false
      const url = urls[i]
      const MAX_RETRIES = 2
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (this.cancelled) return false
        try {
          return await this.doDownload(url)
        } catch (err) {
          if (this.cancelled) return false
          lastError = err instanceof Error ? err : new Error(String(err))
          if (isUnavailableDownloadSource(err)) break
          if (attempt === MAX_RETRIES) break
          const delay = Math.pow(2, attempt) * 1000
          this.emitProgress(0, this.modelInfo.size, `Network error. Retrying in ${delay / 1000}s...`)
          await this.waitForRetry(delay)
        }
      }
      this.cleanup()
      if (i < urls.length - 1) {
        this.emitProgress(0, this.modelInfo.size, 'Switching to next source...')
        await this.waitForRetry(1000)
      }
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
    // Electron net uses Chromium's proxy configuration on every platform.
    return this.doDownloadNet(url)
  }

  /** Download using Electron's net module (Chromium stack, proxy-aware) */
  private async doDownloadNet(url: string): Promise<boolean> {
    if (this.cancelled) return false
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

    return new Promise<boolean>((resolve, reject) => {
      const headers: Record<string, string> = {
        'User-Agent': 'CellSentry/1.0'
      }
      if (resumePos > 0) {
        headers['Range'] = `bytes=${resumePos}-`
      }

      const req = net.request({
        method: 'GET',
        url,
        // An approved source must not silently send the user to another host.
        redirect: 'error',
      })

      for (const [key, value] of Object.entries(headers)) {
        req.setHeader(key, value)
      }

      this._currentRequest = req

      let bodyTimeout: ReturnType<typeof setTimeout> | undefined
      const clearTimers = (): void => { clearTimeout(connectTimeout); clearTimeout(bodyTimeout) }
      const connectTimeout = setTimeout(() => {
        req.abort()
        reject(new Error('Connection timed out'))
      }, 15_000)

      this._cancelDownload = () => { clearTimers(); resolve(false) }

      req.on('response', (response) => {
        clearTimeout(connectTimeout)
        // Electron IncomingMessage may not expose destroy(). Keep an error
        // listener even when a status or cancellation settles before streaming.
        response.on('error', (error: unknown) => {
          clearTimers()
          reject(error instanceof Error ? error : new Error('Download response failed'))
          req.abort()
        })
        if (this.cancelled) {
          ;(response as unknown as DownloadResponse).destroy?.()
          resolve(false)
          req.abort()
          return
        }
        this._currentResponse = response
        const armBodyTimeout = (): void => {
          clearTimeout(bodyTimeout)
          bodyTimeout = setTimeout(() => { req.abort(); reject(new Error('Download stalled')) }, 30_000)
        }
        armBodyTimeout()
        response.on('data', armBodyTimeout)
        response.on('end', clearTimers)
        response.on('aborted', () => { clearTimers(); reject(new Error('Download interrupted')) })
        this.handleResponse(response, tempPath, finalPath, resumePos,
          success => {
            clearTimers()
            resolve(success)
            if (response.statusCode === 416) req.abort()
          },
          error => {
            clearTimers()
            // Preserve the typed failure before abort can emit another error.
            reject(error)
            req.abort()
          })
      })

      req.on('error', (err: Error) => {
        clearTimers()
        reject(new Error(`Request error: ${err.message}`))
      })

      req.end()
    }).finally(() => {
      this._cancelDownload = null
      this._currentRequest = null
      this._currentResponse = null
      this._activeStream?.destroy()
      this._activeStream = null
    })
  }

  /** Shared response handler for both net and https transports */
  private handleResponse(
    response: DownloadResponse,
    tempPath: string,
    finalPath: string,
    resumePos: number,
    resolve: (value: boolean) => void,
    reject: (reason: Error) => void
  ): void {
    const statusCode = response.statusCode || 0

    if (statusCode === 416) {
      try {
        if (!this.isCompleteAndValid(tempPath)) throw new Error('HTTP 416: partial download is not a valid complete model')
        renameSync(tempPath, finalPath)
        resolve(true)
      } catch (error) {
        // A complete-but-corrupt temporary file would otherwise make every
        // retry ask for the same invalid final byte range and receive 416.
        this.cleanup()
        reject(error instanceof Error ? error : new Error('Failed to finalize model'))
      }
      return
    }

    // A server ignoring Range starts a new, complete response.
    if (resumePos > 0 && statusCode === 200) {
      resumePos = 0
      try { unlinkSync(tempPath) } catch { /* stream will report write failure */ }
    }

    if (statusCode !== 200 && statusCode !== 206) {
      reject(new ModelDownloadHttpError(statusCode))
      response.destroy?.()
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

    this._activeStream = fileStream

    response.on('data', (chunk: Buffer) => {
      if (this.cancelled) {
        fileStream.destroy()
        response.destroy?.()
        return
      }
      // Writable streams apply backpressure asynchronously. Ignoring a
      // false return here lets a fast network queue a large part of the
      // 1.5 GiB model in memory while a slower disk catches up.
      const writable = fileStream.write(chunk)
      if (!writable && response.pause && response.resume) {
        response.pause()
        fileStream.once('drain', () => {
          if (!this.cancelled) response.resume?.()
        })
      }
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
        try {
        if (this.cancelled) {
          resolve(false)
          return
        }

        if (!this.hasExpectedSize(tempPath)) {
          this.cleanup()
          reject(new Error('Downloaded file size validation failed'))
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
        } catch (error) { reject(error instanceof Error ? error : new Error('Failed to finalize model')) }
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

  private verifyChecksumSync(filePath: string, reportProgress: boolean = true): boolean {
    if (!this.modelInfo.sha256) return true

    const hash = createHash('sha256')
    const totalSize = statSync(filePath).size
    const CHUNK_SIZE = 8192 * 1024 // 8MB

    for (const chunk of readChunksSync(filePath, CHUNK_SIZE)) {
      hash.update(chunk)
    }

    if (reportProgress) this.emitProgress(totalSize, totalSize, 'Verified')
    return hash.digest('hex').toLowerCase() === this.modelInfo.sha256.toLowerCase()
  }

  private isCompleteAndValid(filePath: string): boolean {
    return this.hasExpectedSize(filePath) && this.verifyChecksumSync(filePath, false)
  }

  private hasExpectedSize(filePath: string): boolean {
    return existsSync(filePath) && (this.modelInfo.size <= 0 || statSync(filePath).size === this.modelInfo.size)
  }

  private waitForRetry(delay: number): Promise<void> {
    if (this.cancelled) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._retryWake = null
        resolve()
      }, delay)
      this._retryWake = () => {
        clearTimeout(timer)
        resolve()
      }
    })
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
