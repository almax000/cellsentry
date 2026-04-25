/**
 * OCR bridge — TS-side caller for `scripts/llm_server.py` `ocr` method (AD8).
 *
 * Wraps the existing LlmBridge JSON-lines protocol. Reuses the singleton
 * Python subprocess that's also used for the safety-net analyze method, so
 * we pay one model-load tax per app session per model rather than spawning
 * a second process.
 *
 * W2 Step 2.1: real OCR call wired through llmBridge.send().
 *
 * Error envelope from Python (see scripts/llm_server.py handle_ocr):
 *   {error: "<message>", code: "<code>"}
 *   codes: mlx_vlm_missing | model_missing | image_load_failed | inference_failed | load_failed
 *
 * On success:
 *   {text: string, pages: [{index, text}], latency_ms: number}
 */

import { llmBridge } from '../../llm/bridge'
import type { OcrResult, OcrError } from '../types'
import type { OcrRequest } from './types'

export async function ocrViaLlmBridge(request: OcrRequest): Promise<OcrResult | OcrError> {
  // Ensure the bridge is started — callers don't need to know about lifecycle.
  if (!llmBridge.status.available) {
    await llmBridge.start()
  }

  const params: Record<string, unknown> =
    request.source.kind === 'path'
      ? { path: request.source.path }
      : { base64: request.source.data, mime: request.source.mime }

  const response = await llmBridge.send({ method: 'ocr', params })

  if (response.error) {
    return { error: response.error, code: 'bridge_error' }
  }

  const result = response.result as Record<string, unknown> | undefined
  if (!result) {
    return { error: 'OCR returned empty response', code: 'empty_response' }
  }

  // Python may return either success {text, pages, latency_ms} or
  // error envelope {error, code}; normalize.
  if (typeof result.error === 'string') {
    return { error: result.error, code: typeof result.code === 'string' ? result.code : 'unknown' }
  }

  if (typeof result.text !== 'string') {
    return { error: 'OCR result missing text field', code: 'malformed_response' }
  }

  const pages = Array.isArray(result.pages) ? result.pages : [{ index: 0, text: result.text }]
  const latency = typeof result.latency_ms === 'number' ? result.latency_ms : 0

  return {
    text: result.text,
    pages: pages.map((p, i) => ({
      index: typeof (p as Record<string, unknown>).index === 'number' ? (p as Record<string, number>).index : i,
      text: typeof (p as Record<string, unknown>).text === 'string' ? (p as Record<string, string>).text : '',
    })),
    latency_ms: latency,
  }
}

/** Type guard — narrows the union return type for callers. */
export function isOcrError(r: OcrResult | OcrError): r is OcrError {
  return 'error' in r
}
