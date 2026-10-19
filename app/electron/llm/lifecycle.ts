/**
 * LLM lifecycle management — lazy start, graceful shutdown, convenience API.
 *
 * The main window warms the native runtime in the background; requests can also start it lazily.
 * If the native runtime or model is unavailable, analysis uses the rule engine.
 */

import { app } from 'electron'
import { llmBridge } from './bridge'
import { cancellationAction } from './cancellationPolicy'
import type {
  LlmIssueInput,
  LlmJudgment,
  LlmCellContext,
  LlmStatus,
  PiiLlmFinding,
  ExtractionLlmResult,
} from './types'

const LLM_BATCH_SIZE = 8

export function setupLlmLifecycle(): void {
  let stopped = false
  let stopping = false
  app.on('before-quit', async (event) => {
    if (stopped) return
    event.preventDefault()
    if (stopping) return
    stopping = true
    await llmBridge.shutdown()
    stopped = true
    app.quit()
  })
}

export async function getLlmStatus(): Promise<LlmStatus> {
  // If the bridge hasn't started yet, try starting it to get real status
  if (!llmBridge.status.available && llmBridge.status.backend === 'none') {
    await llmBridge.start()
  }
  return llmBridge.status
}

/**
 * Start the LLM bridge explicitly.
 * Called after model download to warm up the bridge.
 */
export async function startLlm(): Promise<LlmStatus> {
  await llmBridge.start()
  return llmBridge.status
}

/**
 * Send rule-engine issues to the LLM for validation.
 * Batches issues into groups of LLM_BATCH_SIZE to avoid overwhelming the model.
 */
export async function analyzeWithLlm(
  issues: LlmIssueInput[],
): Promise<LlmJudgment[]> {
  if (issues.length === 0) return []

  // Batch into groups
  const allJudgments: LlmJudgment[] = []
  // The formula-specialized GGUF was evaluated with one issue per request.
  for (let i = 0; i < issues.length; i += 1) {
    const batch = issues.slice(i, i + 1)

    const response = await llmBridge.send({
      method: 'analyze',
      params: {
        issues: batch,
        mode: 'audit',
      },
    })

    if (!response.error && response.result?.judgments) {
      allJudgments.push(...response.result.judgments)
    }
  }

  return allJudgments
}

/**
 * Ask LLM to detect PII in cells that regex might miss.
 */
export async function analyzeWithLlmPii(
  cells: LlmCellContext[],
): Promise<PiiLlmFinding[]> {
  if (cells.length === 0) return []

  const allFindings: PiiLlmFinding[] = []
  for (let i = 0; i < cells.length; i += LLM_BATCH_SIZE) {
    const batch = cells.slice(i, i + LLM_BATCH_SIZE)

    const response = await llmBridge.send({
      method: 'analyze',
      params: {
        cells: batch,
        mode: 'pii',
      },
    })

    if (!response.error && response.result?.findings) {
      allFindings.push(...response.result.findings)
    }
  }

  return allFindings
}

/**
 * Ask LLM to identify document type and extract fields.
 */
export async function analyzeWithLlmExtraction(
  cells: LlmCellContext[],
): Promise<ExtractionLlmResult | null> {
  if (cells.length === 0) return null

  // Send up to 200 cells (no batching needed — single request)
  const sample = cells.slice(0, 200)

  const response = await llmBridge.send({
    method: 'analyze',
    params: {
      cells: sample,
      mode: 'extraction',
    },
  })

  if (response.error || !response.result?.extraction) {
    return null
  }

  return response.result.extraction
}

/**
 * Merge LLM judgments back into engine issues.
 *
 * For each issue that the LLM reviewed:
 * - Protected cancellation suggestions abstain and keep the original issue
 * - Other isValid=false judgments are attached as model disagreement
 * - Model confidence is stored separately from original rule confidence
 * - reasoning is attached for display in the UI
 */
export function mergeJudgments<T extends { ruleId: string; cellAddress: string | null; formula?: string | null }>(
  issues: T[],
  judgments: LlmJudgment[],
): Array<T & { llmVerified?: boolean; llmConfidence?: number; llmReasoning?: string; llmReviewRequired?: boolean }> {
  const judgmentMap = new Map(
    judgments.map((j) => [`${j.ruleId}:${j.cellAddress}`, j]),
  )

  return issues.map((issue) => {
    const key = `${issue.ruleId}:${issue.cellAddress}`
    const judgment = judgmentMap.get(key)

    if (!judgment) return issue

    // Reapply locally at the merge boundary, including judgments from other callers.
    const requiresReview = cancellationAction(issue.ruleId, issue.formula ?? '', judgment.isValid).action === 'review'

    return {
      ...issue,
      llmVerified: requiresReview ? undefined : judgment.isValid,
      llmReviewRequired: requiresReview,
      llmConfidence: judgment.adjustedConfidence,
      llmReasoning: judgment.reasoning,
    }
  })
}

/**
 * Build the prompt text for a set of issues (useful for debugging/logging).
 */
export { buildAuditPrompt } from './prompts'
