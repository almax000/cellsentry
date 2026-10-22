/**
 * Main-process wrapper around the native macOS `cellsentry-docreader` tool, which reads PDFs and
 * photos into text on this machine (PDFKit text layer, Vision OCR for scans and images).
 *
 * The promise never rejects: every failure, including a missing binary, cancellation and timeout,
 * is reported as an error code on the affected files so callers keep the pages already read.
 * Nothing here logs; document text and the reader's stderr never reach any log.
 */
import { spawn, type ChildProcess } from 'child_process'
import { accessSync, constants, statSync } from 'fs'
import { join, resolve } from 'path'
import { createInterface } from 'readline'
import { getRuntimeDir } from '../model/paths'
import { IS_TEST_MODE } from '../testMode'

export const DOC_READER_BINARY = 'cellsentry-docreader'
export const DEFAULT_DOC_READER_TIMEOUT_MS = 10 * 60 * 1000
/** A reader that prints nothing for this long is stuck (a malformed PDF can hang PDFKit). Even a recognized page takes seconds. */
export const DEFAULT_DOC_READER_IDLE_MS = 60 * 1000
const KILL_GRACE_MS = 2000

export type DocumentKind = 'pdf' | 'image'
export type PageSource = 'text' | 'ocr'

/** Codes written by the native reader itself. */
export type NativeReadErrorCode = 'unreadable' | 'encrypted' | 'restricted' | 'too_large' | 'unsupported' | 'ocr_failed' | 'too_many_pages'
  | 'too_much_text' | 'needs_ocr'

/** Codes added by this wrapper. */
export type WrapperReadErrorCode =
  | 'reader_missing'       // binary not found or not executable
  | 'unsupported_platform' // not macOS
  | 'reader_failed'        // crashed, exited non-zero, or stopped before finishing a file
  | 'invalid_output'       // a stdout line that is not a valid event
  | 'cancelled'            // options.signal aborted
  | 'timeout'              // options.timeoutMs elapsed, or nothing came out for options.idleTimeoutMs
  | 'text_limit'           // options.maxTextChars reached, or one output line grew past the line limit

export type ReadErrorCode = NativeReadErrorCode | WrapperReadErrorCode

export type DocReaderEvent =
  | { type: 'start'; file: number; path: string; kind: DocumentKind; pages: number }
  | { type: 'page'; file: number; page: number; pages: number; source: PageSource; text: string }
  | { type: 'error'; file: number; page?: number; code: ReadErrorCode; message: string }
  | { type: 'end'; file: number }
  | { type: 'done' }

export interface ReadDocumentPage {
  page: number
  source: PageSource
  text: string
}

export interface ReadDocumentError {
  page?: number
  code: ReadErrorCode
  message: string
}

export interface ReadDocumentResult {
  path: string
  /** null when the reader never started this file (unsupported, unreadable, encrypted, aborted). */
  kind: DocumentKind | null
  pages: ReadDocumentPage[]
  errors: ReadDocumentError[]
}

export interface ReadDocumentsOptions {
  /** Receives native events as they arrive, plus wrapper errors (invalid_output, cancelled, ...). */
  onEvent?: (event: DocReaderEvent) => void
  signal?: AbortSignal
  /** Overrides the bundled runtime directory (and CELLSENTRY_DOCREADER in test mode). */
  binaryPath?: string
  /** Whole-run limit, default 10 minutes. */
  timeoutMs?: number
  /** Stop when the reader prints nothing for this long, default 60 seconds; finished files are kept. */
  idleTimeoutMs?: number
  /** Stop reading once this much page text has arrived; the files not finished get `text_limit`. */
  maxTextChars?: number
  /** False reads text layers only: photos and scanned pages come back as `needs_ocr`, and Vision is never used. */
  ocr?: boolean
}

/** One output line is one page; a line this long means something is wrong, and buffering it could exhaust memory. */
const MAX_LINE_BYTES = 64 * 1024 * 1024

const NATIVE_CODES = new Set<string>(['unreadable', 'encrypted', 'restricted', 'too_large', 'unsupported', 'ocr_failed', 'too_many_pages', 'too_much_text',
  'needs_ocr'])
const MESSAGES: Record<WrapperReadErrorCode, string> = {
  reader_missing: 'Document reader is not installed.',
  unsupported_platform: 'Document reading is only available on macOS.',
  reader_failed: 'Document reader stopped unexpectedly.',
  invalid_output: 'Document reader produced an unreadable output line.',
  cancelled: 'Document reading was cancelled.',
  timeout: 'Document reading timed out.',
  text_limit: 'Documents contain too much text; reading stopped.',
}

/** The bundled reader. Only test runs may point elsewhere, so a stray variable cannot swap the program that sees documents. */
export function getDefaultDocReaderPath(): string {
  if (IS_TEST_MODE && process.env.CELLSENTRY_DOCREADER) return resolve(process.env.CELLSENTRY_DOCREADER)
  return join(getRuntimeDir(), DOC_READER_BINARY)
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const isInt = (value: unknown): value is number => Number.isInteger(value)
const isPositiveInt = (value: unknown): value is number => isInt(value) && value >= 1

/** Validates one parsed line; anything unexpected is treated as invalid output, never trusted. */
function toEvent(value: unknown, fileCount: number): DocReaderEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { type, file, path, kind, page, pages, source, text, code, message } = value as Record<string, unknown>
  if (type === 'done') return { type: 'done' }
  if (!isInt(file) || file < 0 || file >= fileCount) return null
  switch (type) {
    case 'start':
      if (typeof path !== 'string' || (kind !== 'pdf' && kind !== 'image') || !isInt(pages) || pages < 0) return null
      return { type: 'start', file, path, kind, pages }
    case 'page':
      if (!isPositiveInt(page) || !isInt(pages) || (source !== 'text' && source !== 'ocr') || typeof text !== 'string') {
        return null
      }
      return { type: 'page', file, page, pages, source, text }
    case 'error':
      if (typeof code !== 'string' || !NATIVE_CODES.has(code) || typeof message !== 'string') return null
      if (page === undefined) return { type: 'error', file, code: code as NativeReadErrorCode, message }
      return isPositiveInt(page) ? { type: 'error', file, page, code: code as NativeReadErrorCode, message } : null
    case 'end':
      return { type: 'end', file }
    default:
      return null
  }
}

export function readDocuments(paths: string[], options: ReadDocumentsOptions = {}): Promise<ReadDocumentResult[]> {
  const results: ReadDocumentResult[] = paths.map((path) => ({ path, kind: null, pages: [], errors: [] }))
  const ended = new Set<number>()

  const notify = (event: DocReaderEvent): void => {
    try {
      options.onEvent?.(event)
    } catch {
      // A failing listener must not break reading; it is the caller's bug and is not logged here.
    }
  }
  const addError = (file: number, code: ReadErrorCode, message: string, page?: number): void => {
    const error: ReadDocumentError = page === undefined ? { code, message } : { page, code, message }
    results[file].errors.push(error)
    notify({ type: 'error', file, code, message, ...(page === undefined ? {} : { page }) })
  }
  /** Gives every file not yet finished the same wrapper error. */
  const failRemaining = (code: WrapperReadErrorCode): ReadDocumentResult[] => {
    results.forEach((_, file) => {
      if (!ended.has(file)) addError(file, code, MESSAGES[code])
    })
    return results
  }

  if (paths.length === 0) return Promise.resolve(results)
  if (process.platform !== 'darwin') return Promise.resolve(failRemaining('unsupported_platform'))
  if (options.signal?.aborted) return Promise.resolve(failRemaining('cancelled'))

  let binary: string
  try {
    binary = options.binaryPath ? resolve(options.binaryPath) : getDefaultDocReaderPath()
  } catch {
    return Promise.resolve(failRemaining('reader_missing'))
  }
  if (!isExecutableFile(binary)) return Promise.resolve(failRemaining('reader_missing'))

  const limit = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
  const timeoutMs = limit(options.timeoutMs, DEFAULT_DOC_READER_TIMEOUT_MS)
  const idleMs = limit(options.idleTimeoutMs, DEFAULT_DOC_READER_IDLE_MS)

  return new Promise((resolvePromise) => {
    let child: ChildProcess
    try {
      // No shell: paths go straight to argv. stdin and stderr are not used (stderr is discarded).
      // Options go before a literal "--", so no path can ever be read as one.
      const args = [...(options.ocr === false ? ['--text-only'] : []), '--', ...paths]
      child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true })
    } catch {
      resolvePromise(failRemaining('reader_failed'))
      return
    }

    let stopReason: 'cancelled' | 'timeout' | 'text_limit' | null = null
    let textChars = 0
    let sawDone = false
    let settled = false
    let killTimer: NodeJS.Timeout | undefined

    const stop = (reason: 'cancelled' | 'timeout' | 'text_limit'): void => {
      if (stopReason || settled) return
      stopReason = reason
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
      killTimer.unref()
    }
    const onAbort = (): void => stop('cancelled')
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => stop('timeout'), timeoutMs)
    // Restarted by every chunk of output: a reader that keeps printing is making progress.
    let idleTimer = setTimeout(() => stop('timeout'), idleMs)
    const stillWorking = (): void => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => stop('timeout'), idleMs)
    }

    const finish = (spawnError?: NodeJS.ErrnoException): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(idleTimer)
      if (killTimer) clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', onAbort)
      if (stopReason) failRemaining(stopReason)
      else if (spawnError) failRemaining(spawnError.code === 'ENOENT' || spawnError.code === 'EACCES' ? 'reader_missing' : 'reader_failed')
      else if (!sawDone || ended.size < paths.length) failRemaining('reader_failed')
      resolvePromise(results)
    }

    /** The reader works through files in order, so stray output belongs to the first unfinished file. */
    const currentFile = (): number => {
      for (let file = 0; file < paths.length; file++) if (!ended.has(file)) return file
      return paths.length - 1
    }

    const handleLine = (line: string): void => {
      if (stopReason || line.trim() === '') return
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        parsed = undefined
      }
      const event = parsed === undefined ? null : toEvent(parsed, paths.length)
      if (!event || (event.type !== 'done' && ended.has(event.file))) {
        addError(currentFile(), 'invalid_output', MESSAGES.invalid_output)
        return
      }
      switch (event.type) {
        case 'start':
          results[event.file].kind = event.kind
          break
        case 'page':
          results[event.file].pages.push({ page: event.page, source: event.source, text: event.text })
          textChars += event.text.length
          if (options.maxTextChars !== undefined && textChars > options.maxTextChars) {
            notify(event)
            stop('text_limit')
            return
          }
          break
        case 'error':
          results[event.file].errors.push(event.page === undefined
            ? { code: event.code, message: event.message }
            : { page: event.page, code: event.code, message: event.message })
          break
        case 'end':
          ended.add(event.file)
          break
        case 'done':
          sawDone = true
          break
      }
      notify(event)
    }

    let streamClosed = false
    let exited = false
    const maybeFinish = (): void => {
      if (streamClosed && exited) finish()
    }
    // readline holds a whole line in memory before handing it over, so watch the bytes since the last newline.
    let lineBytes = 0
    child.stdout!.on('data', (chunk: Buffer) => {
      stillWorking()
      const lastNewline = chunk.lastIndexOf(10)
      lineBytes = lastNewline === -1 ? lineBytes + chunk.length : chunk.length - lastNewline - 1
      if (lineBytes > MAX_LINE_BYTES) stop('text_limit')
    })
    const lines = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    lines.on('line', handleLine)
    lines.on('close', () => {
      streamClosed = true
      maybeFinish()
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      lines.close()
      finish(error)
    })
    child.on('exit', () => {
      exited = true
      maybeFinish()
    })
  })
}
