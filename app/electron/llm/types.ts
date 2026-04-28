/**
 * LLM Bridge types — JSON-RPC protocol between Electron and Python subprocess.
 *
 * Lean rebuild: only OCR remains as a real method (status + shutdown are
 * housekeeping). The 'analyze' method was revoked along with the Qwen-3B
 * safety-net (D21 / AD2). v1-era types (LlmIssueInput / LlmCellContext /
 * LlmJudgment / PiiLlmFinding / ExtractionLlmResult) deleted in 2026-04-28
 * audit — they belonged to the spreadsheet engine that no longer exists.
 */

export interface LlmRequest {
  id: number
  method: 'status' | 'shutdown' | 'ocr'
  /**
   * params shape varies by method. The Python server validates per-method.
   * For 'ocr': { path | base64+mime, model_dir?, prompt? }.
   */
  params?: Record<string, unknown>
}

export interface LlmResponse {
  id: number
  result?: {
    status?: LlmStatus
    text?: string
    pages?: Array<{ index: number; text: string }>
    latency_ms?: number
    ok?: boolean
    ocr_available?: boolean
    model_dir?: string
    default_ocr_dirname?: string
    platform?: string
  }
  error?: string
}

export interface LlmStatus {
  available: boolean
  backend: string
  modelLoaded: boolean
  modelName?: string
}
