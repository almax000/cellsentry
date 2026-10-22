import type { ExtractionLlmResult, LlmIssueInput, LlmJudgment, PiiLlmFinding } from './types'
import { cancellationAction } from './cancellationPolicy'

type RecordValue = Record<string, unknown>
function object(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function confidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function normalizeLegacyAuditIdentity(value: RecordValue, issue: LlmIssueInput): RecordValue {
  // The cached Qwen audit GGUF was trained to echo the prompt's display
  // notation (`Sheet!A1` and `[rule]`). Normalize only those exact aliases;
  // a different sheet, cell, or rule still fails the strict identity check.
  return {
    ...value,
    cellAddress: value.cellAddress === `${issue.sheetName}!${issue.cellAddress}`
      ? issue.cellAddress
      : value.cellAddress,
    ruleId: value.ruleId === `[${issue.ruleId}]` ? issue.ruleId : value.ruleId,
  }
}

/** Wrong identities and invalid JSON never update a finding. */
export function parseAudit(raw: string, issue: LlmIssueInput): LlmJudgment[] {
  const result: unknown = JSON.parse(raw)
  if (!Array.isArray(result) || result.length !== 1 || !object(result[0])) {
    throw new Error('Expected one audit judgment')
  }
  const j = normalizeLegacyAuditIdentity(result[0], issue)
  // sheetName is normally omitted and bound from the source issue. If a model
  // emits it, it must corroborate that same source rather than be overwritten.
  const hasSheetName = Object.hasOwn(j, 'sheetName')
  if ((hasSheetName && j.sheetName !== issue.sheetName)
    || j.cellAddress !== issue.cellAddress || j.ruleId !== issue.ruleId
    || typeof j.isValid !== 'boolean' || !confidence(j.adjustedConfidence)
    || typeof j.reasoning !== 'string' || !j.reasoning.trim()) throw new Error('Invalid audit judgment or identity')
  // The model chooses neither worksheet identity nor review policy. Bind the
  // response to the source issue so identical addresses on different sheets
  // cannot collide; only local code sets review status.
  const judgment: LlmJudgment = { sheetName: issue.sheetName, cellAddress: j.cellAddress as string, ruleId: j.ruleId as string,
    isValid: j.isValid, adjustedConfidence: j.adjustedConfidence, reasoning: j.reasoning }
  const policy = cancellationAction(issue.ruleId, issue.formula, judgment.isValid)
  if (policy.action === 'review') {
    judgment.requiresReview = true
    judgment.reviewReason = policy.reason
  }
  return [judgment]
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
