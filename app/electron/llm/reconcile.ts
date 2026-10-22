import { cancellationAction } from './cancellationPolicy'
import type { LlmJudgment } from './types'

export type LlmAnnotatedIssue = {
  id?: string
  ruleId: string
  cellAddress: string | null
  sheet?: string | null
  formula?: string | null
  confidence?: number
  llmVerified?: boolean
  llmConfidence?: number
  llmReasoning?: string
  /** A deterministic rule finding that the model disputes remains reviewable. */
  llmDisputed?: boolean
  /** A protected cancellation: the model abstains and the user reviews the finding. */
  llmReviewRequired?: boolean
}

/**
 * Attach only a well-formed, exact sheet/rule/cell judgment. A negative model
 * decision annotates the deterministic finding for review; it never deletes it.
 */
export function mergeJudgments<T extends LlmAnnotatedIssue>(issues: T[], judgments: LlmJudgment[]): Array<T & LlmAnnotatedIssue> {
  const pending = new Map<string, LlmJudgment>()
  for (const judgment of judgments) {
    if (!isJudgment(judgment)) continue
    const key = judgmentKey(judgment.sheetName, judgment.ruleId, judgment.cellAddress)
    // Deterministic first-writer behaviour makes retries idempotent.
    if (!pending.has(key)) pending.set(key, judgment)
  }

  return issues.map((issue) => {
    const judgment = pending.get(judgmentKey(issue.sheet, issue.ruleId, issue.cellAddress))
    if (!judgment) return issue
    // Reapply the cancellation policy here, whoever produced the judgment.
    const review = cancellationAction(issue.ruleId, issue.formula ?? '', judgment.isValid).action === 'review'
    return {
      ...issue,
      llmVerified: review ? undefined : judgment.isValid,
      llmDisputed: review ? undefined : !judgment.isValid,
      llmReviewRequired: review,
      llmConfidence: judgment.adjustedConfidence,
      llmReasoning: judgment.reasoning,
    }
  })
}

function judgmentKey(sheet: string | null | undefined, ruleId: string, cellAddress: string | null): string {
  return `${sheet ?? ''}\u0000${ruleId}\u0000${cellAddress ?? ''}`
}

function isJudgment(value: LlmJudgment): boolean {
  return typeof value.sheetName === 'string' && value.sheetName.length > 0
    && typeof value.ruleId === 'string' && value.ruleId.length > 0
    && typeof value.cellAddress === 'string' && value.cellAddress.length > 0
    && typeof value.isValid === 'boolean'
    && typeof value.adjustedConfidence === 'number' && Number.isFinite(value.adjustedConfidence)
    && value.adjustedConfidence >= 0 && value.adjustedConfidence <= 1
    && typeof value.reasoning === 'string'
}
