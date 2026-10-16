import type { ExtractionLlmResult, LlmIssueInput, LlmJudgment, PiiLlmFinding } from './types'

type RecordValue = Record<string, unknown>
function object(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function confidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/** Wrong identities and invalid JSON never update a finding. */
export function parseAudit(raw: string, issue: LlmIssueInput): LlmJudgment[] {
  const result: unknown = JSON.parse(raw)
  if (!Array.isArray(result) || result.length !== 1) throw new Error('Expected one audit judgment')
  const j: unknown = result[0]
  if (!object(j) || j.cellAddress !== issue.cellAddress || j.ruleId !== issue.ruleId
    || typeof j.isValid !== 'boolean' || !confidence(j.adjustedConfidence)
    || typeof j.reasoning !== 'string' || !j.reasoning.trim()) throw new Error('Invalid audit judgment or identity')
  return [j as unknown as LlmJudgment]
}

export function parsePii(raw: string, addresses: Set<string>): PiiLlmFinding[] {
  const result: unknown = JSON.parse(raw)
  const types = new Set(['email', 'phone', 'ssn', 'national_id', 'credit_card', 'iban', 'passport'])
  if (!Array.isArray(result) || !result.every(j => object(j) && typeof j.cellAddress === 'string'
    && addresses.has(j.cellAddress) && typeof j.piiType === 'string' && types.has(j.piiType)
    && confidence(j.confidence) && typeof j.reasoning === 'string')) throw new Error('Invalid PII response')
  return result as PiiLlmFinding[]
}

export function parseExtraction(raw: string, addresses: Set<string>): ExtractionLlmResult {
  const result: unknown = JSON.parse(raw)
  const types = new Set(['invoice', 'receipt', 'expense_report', 'purchase_order', 'payroll', 'unknown'])
  if (!object(result) || typeof result.documentType !== 'string' || !types.has(result.documentType)
    || !Array.isArray(result.fields) || !result.fields.every(f => object(f)
      && ['key', 'label', 'value', 'cellAddress'].every(k => typeof f[k] === 'string')
      && addresses.has(f.cellAddress as string) && confidence(f.confidence))) throw new Error('Invalid extraction response')
  return result as unknown as ExtractionLlmResult
}
