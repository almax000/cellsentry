/**
 * LLM lifecycle management — lazy start, graceful shutdown, convenience API.
 *
 * The bridge starts on first request (not at app launch) to keep startup fast.
 * If Python or the model is unavailable, all functions degrade gracefully.
 */

import { app } from 'electron'
import { llmBridge } from './bridge'
import type { LlmIssueInput, LlmJudgment, LlmStatus } from './types'

export function setupLlmLifecycle(): void {
  app.on('before-quit', async () => {
    await llmBridge.shutdown()
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
 * Send rule-engine issues to the LLM for validation.
 * Returns the original issues enriched with LLM judgments, or the issues
 * unchanged if the bridge is unavailable.
 */
export async function analyzeWithLlm(
  issues: LlmIssueInput[],
): Promise<LlmJudgment[]> {
  if (issues.length === 0) return []

  const response = await llmBridge.send({
    method: 'analyze',
    params: {
      issues,
      mode: 'audit',
    },
  })

  if (response.error || !response.result?.judgments) {
    return []
  }

  return response.result.judgments
}

/**
 * Merge LLM judgments back into engine issues.
 *
 * For each issue that the LLM reviewed:
 * - If isValid is false (false positive), the issue can be filtered out
 * - adjustedConfidence replaces the original confidence
 * - reasoning is attached for display in the UI
 */
export function mergeJudgments<T extends { ruleId: string; cellAddress: string | null }>(
  issues: T[],
  judgments: LlmJudgment[],
): Array<T & { llmVerified?: boolean; llmConfidence?: number; llmReasoning?: string }> {
  const judgmentMap = new Map(
    judgments.map((j) => [`${j.ruleId}:${j.cellAddress}`, j]),
  )

  return issues.map((issue) => {
    const key = `${issue.ruleId}:${issue.cellAddress}`
    const judgment = judgmentMap.get(key)

    if (!judgment) return issue

    return {
      ...issue,
      llmVerified: judgment.isValid,
      llmConfidence: judgment.adjustedConfidence,
      llmReasoning: judgment.reasoning,
    }
  })
}

/**
 * Build the prompt text for a set of issues (useful for debugging/logging).
 */
export { buildAuditPrompt } from './prompts'
