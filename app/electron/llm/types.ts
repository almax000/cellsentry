/**
 * LLM Bridge types — JSON-RPC protocol between Electron and Python subprocess.
 */

export interface LlmRequest {
  id: number
  method: 'analyze' | 'status' | 'shutdown'
  params?: {
    issues?: LlmIssueInput[]
    cells?: LlmCellContext[]
    mode?: 'audit' | 'pii' | 'extraction'
  }
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

export interface LlmResponse {
  id: number
  result?: {
    judgments?: LlmJudgment[]
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
