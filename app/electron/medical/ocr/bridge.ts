/**
 * OCR bridge — thin wrapper that delegates to the active OcrEngine.
 *
 * Day 7 (2026-04-28 audit): OCR is disabled by default. When disabled,
 * `ocrViaLlmBridge` returns an OcrError with code 'ocr_disabled' so the
 * orchestrator surfaces a clear message to the user about using system OCR
 * (macOS Live Text / Windows OCR API) for image inputs.
 */

import { getActiveOcrEngine } from './engine'
import type { OcrError, OcrResult } from '../types'
import type { OcrRequest } from './types'

const DISABLED_ERROR: OcrError = {
  error:
    'Image OCR is not enabled in this build. Use macOS Live Text or Windows ' +
    'OCR to extract the image text first, then paste it into the source ' +
    "textarea. To enable in-app OCR, set CELLSENTRY_OCR_TIER (bf16/8bit/4bit) " +
    'and restart.',
  code: 'ocr_disabled',
}

export async function ocrViaLlmBridge(request: OcrRequest): Promise<OcrResult | OcrError> {
  const engine = getActiveOcrEngine()
  if (!engine) return DISABLED_ERROR
  return engine.recognize(request)
}

/** Type guard — narrows the union return type for callers. */
export function isOcrError(r: OcrResult | OcrError): r is OcrError {
  return 'error' in r
}
