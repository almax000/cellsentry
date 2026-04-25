/**
 * Digital PDF fallback (W2 Step 2.1).
 *
 * For PDFs with embedded text layer, skip OCR entirely and use `pdf-parse` to
 * extract text directly. Faster (no LLM call) and avoids the "hidden text"
 * security risk per security-assessment P1#7. On failure (image-only PDFs),
 * caller falls back to per-page render → ocrViaLlmBridge.
 */

import type { OcrResult } from '../types'

export async function tryDigitalPdf(_path: string): Promise<OcrResult | null> {
  throw new Error('TODO: W2 Step 2.1 — pdf-parse not yet installed')
}
