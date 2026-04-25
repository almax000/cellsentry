/**
 * LLM Bridge types — JSON-RPC protocol between Electron and Python subprocess.
 */

export interface LlmRequest {
  id: number
  method: 'analyze' | 'status' | 'shutdown' | 'ocr'
  /**
   * params shape varies by method. Kept as a permissive Record for v2 because
   * the v1 audit/pii/extraction shapes (issues / cells / mode) coexist with
   * v2 ocr shapes (path / base64 / mime). The Python server validates per-method.
   */
  params?: Record<string, unknown>
}

export interface LlmIssueInput {
  ruleId: string
  cellAddress: string
  sheetName: string
  formula: string
  message: string
  confidence: number
  context?: string
}

export interface LlmCellContext {
  address: string
  value: string
  formula?: string
}

export interface LlmJudgment {
  cellAddress: string
  ruleId: string
  isValid: boolean
  adjustedConfidence: number
  reasoning: string
}

export interface PiiLlmFinding {
  cellAddress: string
  piiType: string
  confidence: number
  reasoning: string
}

export interface ExtractionLlmResult {
  documentType: string
  fields: Array<{
    key: string
    label: string
    value: string
    cellAddress: string
    confidence: number
  }>
}

export interface LlmResponse {
  id: number
  result?: {
    judgments?: LlmJudgment[]
    findings?: PiiLlmFinding[]
    extraction?: ExtractionLlmResult
    status?: LlmStatus
  }
  error?: string
}

export interface LlmStatus {
  available: boolean
  backend: string
  modelLoaded: boolean
  modelName?: string
}
