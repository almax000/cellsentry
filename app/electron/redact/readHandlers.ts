/**
 * Reading PDFs and photos for the redaction flow. The native reader runs on
 * this computer; progress events to the window carry page numbers only, never
 * document text.
 */
import { ipcMain } from 'electron'
import { basename, extname, normalize } from 'path'
import { readDocuments, type DocReaderEvent, type ReadDocumentResult } from '../docreader/reader'
import { OCR_ENABLED } from '../../shared/redact/features'
import { MAX_READ_FILES, type ReadDocument, type ReadErrorCode, type ReadFailure, type ReadProgressEvent, type ReadResponse } from '../../shared/redact/ipc'

/** All files of one read together; the shareable text must still fit the clipboard. */
const MAX_TOTAL_TEXT = 20_000_000
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff', '.bmp', '.webp'])
const FILE_CODES: ReadonlySet<string> = new Set(['unreadable', 'encrypted', 'restricted', 'too_large', 'unsupported', 'ocr_failed', 'too_many_pages',
  'timeout', 'too_much_text', 'needs_ocr'])
// One read per window: a new read, or the window closing, stops the previous one.
const running = new Map<string, AbortController>()
const bySender = new Map<number, AbortController>()
// Whole-run problems are shown once for the run, not repeated under every file.
const RUN_CODES: ReadonlySet<string> = new Set(['reader_missing', 'unsupported_platform', 'cancelled'])

function validPaths(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0
    && value.every((path) => typeof path === 'string' && path.length > 0 && path.length <= 1024 && !normalize(path).includes('\0'))
}

function fileCode(code: string): ReadErrorCode {
  if (code === 'text_limit') return 'too_much_text'
  return FILE_CODES.has(code) ? (code as ReadErrorCode) : 'failed'
}

/** A failure that hit every file before anything was read is a failure of the whole run. */
function runFailure(results: ReadDocumentResult[]): ReadFailure | null {
  const nothingRead = results.every((result) => result.pages.length === 0)
  const everyFileHas = (code: string): boolean => results.every((result) => result.errors.some((error) => error.code === code))
  if (everyFileHas('reader_missing')) return 'reader_missing'
  if (everyFileHas('unsupported_platform')) return 'unsupported_platform'
  if (nothingRead && everyFileHas('timeout')) return 'timeout'
  return null
}

/**
 * One file for the window. `budget` is the text still allowed in this read;
 * pages past it are dropped and the file says so. A file the user stopped
 * says so too, so a half-read file is never mistaken for a whole one.
 */
function toDocument(result: ReadDocumentResult, path: string, budget: { left: number }): ReadDocument {
  const kind = result.kind ?? (IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) ? 'image' : 'pdf')
  const pages: ReadDocument['pages'] = []
  // A file the read limit stopped before it began has no text of its own: it was simply not read.
  const notStarted = result.pages.length === 0
  const errors: ReadDocument['errors'] = result.errors.filter((error) => !RUN_CODES.has(error.code))
    .map((error) => ({
      ...(error.page !== undefined && { page: error.page }),
      code: error.code === 'text_limit' && notStarted ? 'stopped' : fileCode(error.code),
    }))
  for (const page of result.pages) {
    if (page.text.length > budget.left) {
      // The page that crossed the limit names the spot; a general note for the same cut would only repeat it.
      const general = errors.findIndex((error) => error.code === 'too_much_text' && error.page === undefined)
      if (general !== -1) errors.splice(general, 1)
      errors.push({ page: page.page, code: 'too_much_text' })
      budget.left = 0
      break
    }
    budget.left -= page.text.length
    pages.push({ page: page.page, text: page.text, source: page.source })
  }
  if (result.errors.some((error) => error.code === 'cancelled')) errors.push({ code: 'stopped' })
  return { path, name: basename(path), kind, pages, errors }
}

export function registerReadHandlers(): void {
  ipcMain.handle('redact:read', async (event, requestId: unknown, paths: unknown): Promise<ReadResponse> => {
    if (Array.isArray(paths) && paths.length > MAX_READ_FILES) return { ok: false, error: 'too_many_files' }
    if (typeof requestId !== 'string' || requestId.length > 80 || !validPaths(paths)) return { ok: false, error: 'failed' }
    running.get(requestId)?.abort()
    const senderId = event.sender.id
    bySender.get(senderId)?.abort()
    const controller = new AbortController()
    running.set(requestId, controller)
    bySender.set(senderId, controller)
    // A window that closes or crashes stops its read. (Navigation is not watched: the app's own routes are in-page.)
    const stop = (): void => controller.abort()
    event.sender.once('destroyed', stop)
    event.sender.once('render-process-gone', stop)
    const send = (progress: ReadProgressEvent): void => {
      if (!event.sender.isDestroyed()) event.sender.send('redact:read-progress', progress)
    }
    const onEvent = (item: DocReaderEvent): void => {
      if (item.type === 'start') send({ requestId, fileIndex: item.file, stage: 'start', kind: item.kind, pages: item.pages })
      else if (item.type === 'page') send({ requestId, fileIndex: item.file, stage: 'page', page: item.page, pages: item.pages, source: item.source })
      else if (item.type === 'error' && !RUN_CODES.has(item.code)) send({ requestId, fileIndex: item.file, stage: 'error', page: item.page, code: fileCode(item.code) })
      else if (item.type === 'end') send({ requestId, fileIndex: item.file, stage: 'end' })
    }
    try {
      // The reader stops while reading once the text gets this big; the budget below trims the last page.
      const results = await readDocuments(paths, { signal: controller.signal, onEvent, maxTextChars: MAX_TOTAL_TEXT, ocr: OCR_ENABLED })
      const budget = { left: MAX_TOTAL_TEXT }
      const documents = (): ReadDocument[] => results.map((result, index) => toDocument(result, paths[index], budget))
      // Stopping keeps what was read so far; the window decides whether to go on with it.
      if (controller.signal.aborted) {
        return results.some((result) => result.pages.length > 0) ? { ok: true, documents: documents(), canceled: true } : { ok: false, error: 'canceled' }
      }
      const failure = runFailure(results)
      if (failure) return { ok: false, error: failure }
      return { ok: true, documents: documents() }
    } finally {
      if (running.get(requestId) === controller) running.delete(requestId)
      if (bySender.get(senderId) === controller) bySender.delete(senderId)
      if (!event.sender.isDestroyed()) {
        event.sender.removeListener('destroyed', stop)
        event.sender.removeListener('render-process-gone', stop)
      }
    }
  })

  ipcMain.handle('redact:read-cancel', (_event, requestId: unknown) => {
    if (typeof requestId === 'string') running.get(requestId)?.abort()
  })
}
