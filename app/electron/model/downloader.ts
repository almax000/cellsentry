import https from 'https'
import http from 'http'
import { createHash } from 'crypto'
import {
  createWriteStream, createReadStream,
  existsSync, statSync, unlinkSync, renameSync, mkdirSync, readdirSync
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
  name: 'CellSentry 1.5B Q4KM',
  filename: 'cellsentry-1.5b-q4km.gguf',
  version: 'v1.0',
  size: 940 * 1024 * 1024,
  sha256: 'd2b5667047fd3caa1205100450a5619f149e55eceddf1b214d65d9e6beea96c3',
  downloadUrl: 'https://github.com/almax000/cellsentry/releases/download/model-v1.0/cellsentry-1.5b-q4km.gguf',
  description: 'CellSentry fine-tuned model (Q4_K_M quantization)'
}

export type ProgressCallback = (downloaded: number, total: number, message: string) => void

export class ModelDownloader {
  private targetDir: string
  private modelInfo: ModelInfo
  private progressCallback: ProgressCallback | null = null
  private cancelled = false
  private abortController: AbortController | null = null

  constructor(targetDir: string, modelInfo?: ModelInfo) {
    this.targetDir = targetDir
    this.modelInfo = modelInfo || DEFAULT_MODEL
  }

  setProgressCallback(cb: ProgressCallback): void {
    this.progressCallback = cb
  }

  cancel(): void {
    this.cancelled = true
    this.abortController?.abort()
  }

  getModelPath(): string {
    return join(this.targetDir, this.modelInfo.filename)
  }

  checkModelExists(): boolean {
    // 1. Check MLX fused model directory (macOS/dev)
    const mlxDir = join(this.targetDir, 'cellsentry-1.5b-v2-4bit-g32')
    try {
      if (existsSync(mlxDir) && statSync(mlxDir).isDirectory()) {
        const files = readdirSync(mlxDir)
        if (files.some(f => f.endsWith('.safetensors'))) return true
      }
    } catch { /* ignore */ }

    // 2. Check GGUF file (Windows/production)
    const modelPath = this.getModelPath()
    if (!existsSync(modelPath)) return false

    const actualSize = statSync(modelPath).size
    if (this.modelInfo.size > 0 && actualSize !== this.modelInfo.size) return false

    if (this.modelInfo.sha256) {
      if (!this.verifyChecksumSync(modelPath)) return false
    }

    return true
  }

  async download(): Promise<boolean> {
    this.cancelled = false
    mkdirSync(this.targetDir, { recursive: true })

    const tempPath = this.getTempPath()
    const finalPath = this.getModelPath()

    let resumePos = 0
    if (existsSync(tempPath)) {
      resumePos = statSync(tempPath).size
    }

    this.emitProgress(resumePos, this.modelInfo.size, 'Connecting...')

    return new Promise<boolean>((resolve, reject) => {
      const url = new URL(this.modelInfo.downloadUrl)
      const transport = url.protocol === 'https:' ? https : http

      const headers: Record<string, string> = {
        'User-Agent': 'CellSentry/1.0'
      }
      if (resumePos > 0) {
        headers['Range'] = `bytes=${resumePos}-`
      }

      this.abortController = new AbortController()
      const req = transport.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          headers
        },
        (response) => {
          const statusCode = response.statusCode || 0

          // Handle redirects
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.destroy()
            const redirectUrl = new URL(response.headers.location, url)
            this.modelInfo = { ...this.modelInfo, downloadUrl: redirectUrl.href }
            this.download().then(resolve).catch(reject)
            return
          }

          // Check resume support
          if (resumePos > 0 && statusCode !== 206) {
            resumePos = 0
            try { unlinkSync(tempPath) } catch { /* ignore */ }
          }

          if (statusCode === 416) {
            // Range Not Satisfiable — file may be complete
            response.destroy()
            if (existsSync(tempPath)) {
              renameSync(tempPath, finalPath)
              resolve(true)
            } else {
              reject(new Error('HTTP 416: Range Not Satisfiable'))
            }
            return
          }

          if (statusCode !== 200 && statusCode !== 206) {
            response.destroy()
            reject(new Error(`HTTP error ${statusCode}`))
            return
          }

          const contentLength = response.headers['content-length']
          const totalSize = contentLength
            ? parseInt(contentLength, 10) + resumePos
            : this.modelInfo.size

          let downloaded = resumePos
          const fileStream = createWriteStream(tempPath, {
            flags: resumePos > 0 ? 'a' : 'w'
          })

          response.on('data', (chunk: Buffer) => {
            if (this.cancelled) {
              response.destroy()
              fileStream.close()
              return
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

          response.pipe(fileStream)

          fileStream.on('finish', () => {
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

          response.on('error', (err) => {
            fileStream.close()
            reject(new Error(`Network error: ${err.message}`))
          })

          fileStream.on('error', (err) => {
            response.destroy()
            reject(new Error(`File write error: ${err.message}`))
          })
        }
      )

      req.on('error', (err) => {
        reject(new Error(`Request error: ${err.message}`))
      })

      req.end()
    })
  }

  cleanup(): void {
    const tempPath = this.getTempPath()
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch { /* ignore */ }
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
    const fd = createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
    let readSize = 0

    // Synchronous-style reading via stream
    for (const chunk of readChunksSync(filePath, CHUNK_SIZE)) {
      hash.update(chunk)
      readSize += chunk.length
      this.emitProgress(
        readSize,
        totalSize,
        readSize < totalSize ? 'Verifying checksum...' : 'Verified'
      )
    }
    fd.destroy()

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
