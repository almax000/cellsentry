/**
 * OCR bridge — thin wrapper that delegates to the active OcrEngine.
 *
 * Lean rebuild (D35): the engine layer was extracted into ./engine.ts so the
 * orchestrator code path stays unchanged while Day 5 wires up Settings-driven
 * engine selection.
 */

import { getActiveOcrEngine } from './engine'
import type { OcrError, OcrResult } from '../types'
import type { OcrRequest } from './types'

export async function ocrViaLlmBridge(request: OcrRequest): Promise<OcrResult | OcrError> {
  return getActiveOcrEngine().recognize(request)
}

/** Type guard — narrows the union return type for callers. */
export function isOcrError(r: OcrResult | OcrError): r is OcrError {
  return 'error' in r
}
