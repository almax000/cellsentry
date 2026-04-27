/**
 * OCR engine abstraction (lean rebuild — D35).
 *
 * Two concrete engines:
 *   - `PaddleOcrVlEngine` (primary, 3 quantization tiers per registry)
 *   - `DeepSeekOcr2Engine` (settings-switchable fallback per ADR § 6.4)
 *
 * Both share the same llm_server.py protocol — they differ only in:
 *   1. The on-disk model directory name (passed to the Python server via params)
 *   2. The OCR prompt (model-specific phrasing)
 *
 * Day 5 wires `getActiveOcrEngine()` to a Settings-driven user choice + RAM-based
 * default. For Day 2 the default is PaddleOCR-VL-bf16 — that's what the lean
 * rebuild ships with.
 */

import { llmBridge } from '../../llm/bridge'
import type { OcrError, OcrResult } from '../types'
import type { OcrRequest } from './types'

export interface OcrEngine {
  /** Stable identifier — used for telemetry + Settings UI. */
  readonly id: string
  /** Display name for Settings UI. */
  readonly displayName: string
  /** On-disk model directory name. Must match registry.ts `localDirName`. */
  readonly modelDirName: string
  /** Model-specific OCR prompt. */
  readonly prompt: string

  recognize(request: OcrRequest): Promise<OcrResult | OcrError>
}

abstract class BaseOcrEngine implements OcrEngine {
  abstract readonly id: string
  abstract readonly displayName: string
  abstract readonly modelDirName: string
  abstract readonly prompt: string

  async recognize(request: OcrRequest): Promise<OcrResult | OcrError> {
    if (!llmBridge.status.available) {
      await llmBridge.start()
    }

    const sourceParams: Record<string, unknown> =
      request.source.kind === 'path'
        ? { path: request.source.path }
        : { base64: request.source.data, mime: request.source.mime }

    const response = await llmBridge.send({
      method: 'ocr',
      params: {
        ...sourceParams,
        model_dir: this.modelDirName,
        prompt: this.prompt,
      },
    })

    if (response.error) {
      return { error: response.error, code: 'bridge_error' }
    }

    const result = response.result as Record<string, unknown> | undefined
    if (!result) {
      return { error: 'OCR returned empty response', code: 'empty_response' }
    }

    if (typeof result.error === 'string') {
      return {
        error: result.error,
        code: typeof result.code === 'string' ? result.code : 'unknown',
      }
    }

    if (typeof result.text !== 'string') {
      return { error: 'OCR result missing text field', code: 'malformed_response' }
    }

    const pages = Array.isArray(result.pages)
      ? result.pages
      : [{ index: 0, text: result.text }]
    const latency = typeof result.latency_ms === 'number' ? result.latency_ms : 0

    return {
      text: result.text,
      pages: pages.map((p, i) => {
        const obj = p as Record<string, unknown>
        return {
          index: typeof obj.index === 'number' ? obj.index : i,
          text: typeof obj.text === 'string' ? obj.text : '',
        }
      }),
      latency_ms: latency,
    }
  }
}

class PaddleOcrVlEngine extends BaseOcrEngine {
  readonly id = 'paddleocr-vl-1.5'
  readonly displayName = 'PaddleOCR-VL 1.5'
  readonly modelDirName: string
  readonly prompt = 'OCR.'

  constructor(modelDirName: string) {
    super()
    this.modelDirName = modelDirName
  }
}

class DeepSeekOcr2Engine extends BaseOcrEngine {
  readonly id = 'deepseek-ocr-2'
  readonly displayName = 'DeepSeek-OCR 2 (fallback)'
  readonly modelDirName = 'deepseek-ocr-2-8bit'
  readonly prompt = '<|grounding|>OCR the document into Markdown.'
}

export function makePaddleOcrVlEngine(quantization: 'bf16' | '8bit' | '4bit'): OcrEngine {
  return new PaddleOcrVlEngine(`paddleocr-vl-1.5-${quantization}`)
}

export function makeDeepSeekOcr2Engine(): OcrEngine {
  return new DeepSeekOcr2Engine()
}

/**
 * Returns the user-active OCR engine.
 *
 * Day 2: hardcoded to PaddleOCR-VL-1.5-bf16. Day 5 will replace with:
 *   - Read user override from Settings (if any)
 *   - Else pick PaddleOCR-VL quantization tier from RAM (Day 5)
 */
export function getActiveOcrEngine(): OcrEngine {
  return makePaddleOcrVlEngine('bf16')
}
