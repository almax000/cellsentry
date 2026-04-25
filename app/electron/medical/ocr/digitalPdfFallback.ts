/**
 * Digital PDF fallback (W2 Step 2.1).
 *
 * For PDFs with an embedded text layer, skip OCR entirely and use `pdf-parse`
 * to extract text directly. Two reasons:
 *
 *   1. Performance: pdf-parse takes ~50 ms for a typical document; OCR through
 *      DeepSeek-OCR takes 3-10 seconds per page. For digital PDFs (e.g. typed
 *      consult notes exported from a hospital EHR), text-layer extraction is
 *      strictly better.
 *
 *   2. Security (per security-assessment P1#7): PDFs can carry hidden text
 *      layers (white text, off-page text, or text behind images) used for
 *      prompt injection. By going through pdf-parse first we surface that
 *      hidden text rather than letting an OCR model "look at" the visible
 *      surface and miss it.
 *
 * On failure (image-only PDFs with no text layer, encrypted PDFs, malformed
 * files), returns null. The caller falls back to per-page render → OCR.
 */

import { readFile } from 'fs/promises'
import type { OcrResult } from '../types'

// Lazy-import pdf-parse — it's a 1 MB CommonJS package and shouldn't add to
// startup cost when the user only does plain-text or image work. Plus pdf-parse
// has a known issue where importing it at module top-level runs a self-test
// that can break the bundler in dev mode.
type PdfParse = (buffer: Buffer) => Promise<{ text: string; numpages: number }>

let _pdfParse: PdfParse | null = null

async function getPdfParse(): Promise<PdfParse | null> {
  if (_pdfParse) return _pdfParse
  try {
    const mod = await import('pdf-parse')
    // pdf-parse default-exports a function on CommonJS; with esModuleInterop
    // it's accessible as `mod.default` or `mod` depending on the bundler.
    const fn = (mod as unknown as { default?: PdfParse }).default ?? (mod as unknown as PdfParse)
    _pdfParse = fn
    return fn
  } catch {
    return null
  }
}

const HEURISTIC_MIN_TEXT_PER_PAGE = 50 // chars; below this we fall back to OCR

/**
 * Try to extract text from a digital PDF.
 *
 * Returns:
 *   - OcrResult on success (with `pages: [{index, text}]` per PDF page)
 *   - null when the PDF has no text layer worth extracting (caller falls
 *     back to OCR per page)
 *
 * Does NOT throw on parse failure — converts to null. Genuinely fatal errors
 * (file not found, permission denied) propagate.
 */
export async function tryDigitalPdf(path: string): Promise<OcrResult | null> {
  const t0 = Date.now()
  const pdfParse = await getPdfParse()
  if (!pdfParse) {
    return null
  }

  let buffer: Buffer
  try {
    buffer = await readFile(path)
  } catch {
    return null
  }

  let parsed: { text: string; numpages: number }
  try {
    parsed = await pdfParse(buffer)
  } catch {
    return null
  }

  // Heuristic: if the average text-per-page is too low, the PDF is image-only
  // and we shouldn't claim "extracted." Caller falls back to OCR.
  const avgTextPerPage = parsed.text.length / Math.max(parsed.numpages, 1)
  if (avgTextPerPage < HEURISTIC_MIN_TEXT_PER_PAGE) {
    return null
  }

  // pdf-parse gives one big text blob with form-feed (\f) page separators.
  const pages = parsed.text.split('\f').map((text, index) => ({ index, text }))

  return {
    text: parsed.text,
    pages,
    latency_ms: Date.now() - t0,
  }
}
