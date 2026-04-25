/**
 * OCR bridge: TS-side caller for `scripts/llm_server.py` `ocr` method (AD8).
 *
 * In W2 Step 2.1 this gets wired through the existing LlmBridge subprocess so
 * OCR + safety-net share one Python process. Until then, the bridge is a stub
 * that throws cleanly (callers can detect availability via getLlmStatus()).
 */

import type { OcrResult } from '../types'
import type { OcrRequest } from './types'

export async function ocrViaLlmBridge(_request: OcrRequest): Promise<OcrResult> {
  throw new Error('TODO: W2 Step 2.1 — OCR method not yet exposed by llm_server.py')
}
