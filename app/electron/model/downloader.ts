import { net } from 'electron'
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
  description: string
}

export const DEFAULT_MODEL: ModelInfo = {
  name: 'CellSentry 1.5B v3 Q4KM',
  filename: 'cellsentry-1.5b-v3-q4km.gguf',
  version: 'v3.0',
  size: 940 * 1024 * 1024,
  sha256: '4ae17b3886e4a5089671bf16aa133eaa6d8917a118bde6c75a54c1c3610f7cd3',
  downloadUrl: 'https://huggingface.co/almax000/cellsentry-model/resolve/main/cellsentry-1.5b-v3-q4km.gguf',
  description: 'CellSentry multi-task model (audit + PII + extraction, Q4_K_M)'
}

export type ProgressCallback = (downloaded: number, total: number, message: string) => void

export class ModelDownloader {
  private targetDir: string
  private modelInfo: ModelInfo
  private progressCallback: ProgressCallback | null = null
  private cancelled = false
  private _downloadPromise: Promise<boolean> | null = null
  private _currentRequest: Electron.ClientRequest | null = null

  constructor(targetDir: string, modelInfo?: ModelInfo) {
    this.targetDir = targetDir
    this.modelInfo = modelInfo || DEFAULT_MODEL
  }

  setProgressCallback(cb: ProgressCallback): void {
    this.progressCallback = cb
  }

  cancel(): void {
    this.cancelled = true
    this._currentRequest?.abort()
    this._currentRequest = null
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

    const MAX_RETRIES = 3
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.doDownload()
      } catch (err) {
        if (this.cancelled) return false
        if (attempt === MAX_RETRIES) throw err
        const delay = Math.pow(2, attempt) * 1000
        this.emitProgress(0, this.modelInfo.size, `Network error. Retrying in ${delay / 1000}s...`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
    return false
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

  private async doDownload(): Promise<boolean> {
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

      // Use Electron's net module — respects system proxy settings
      const req = net.request({
        method: 'GET',
        url: this.modelInfo.downloadUrl,
        redirect: 'follow',
      })

      for (const [key, value] of Object.entries(headers)) {
        req.setHeader(key, value)
      }

      this._currentRequest = req

      req.on('response', (response) => {
        const statusCode = response.statusCode

        // Resume not supported — restart from scratch
        if (resumePos > 0 && statusCode !== 206) {
          resumePos = 0
          try { unlinkSync(tempPath) } catch { /* ignore */ }
        }

        if (statusCode === 416) {
          // Range Not Satisfiable — file may be complete
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

            // Verify checksum
            if (this.modelInfo.sha256) {
              this.emitProgress(downloaded, totalSize, 'Verifying checksum...')
              if (!this.verifyChecksumSync(tempPath)) {
                try { unlinkSync(tempPath) } catch { /* ignore */ }
                reject(new Error('Checksum verification failed'))
                return
              }
            }

            // Rename to final path
            if (existsSync(finalPath)) {
              try { unlinkSync(finalPath) } catch { /* ignore */ }
            }
            renameSync(tempPath, finalPath)
            this.emitProgress(totalSize, totalSize, 'Download complete')
            resolve(true)
          })
        })

        response.on('error', (err: Error) => {
          fileStream.close()
          reject(new Error(`Network error: ${err.message}`))
        })

        fileStream.on('error', (err) => {
          reject(new Error(`File write error: ${err.message}`))
        })
      })

      req.on('error', (err: Error) => {
        reject(new Error(`Request error: ${err.message}`))
      })

      req.end()
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
