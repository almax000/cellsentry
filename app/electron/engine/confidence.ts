/**
 * CellSentry Confidence Mechanism
 *
 * Ported from src/confidence.py.
 */

import { ConfidenceLevel } from './types'

export interface ConfidenceResult {
  isError: boolean
  confidence: ConfidenceLevel
  reason: string
  source: string // 'rule_engine' | 'llm' | 'unknown'
  correctFormula?: string
  details: Record<string, unknown>
}

/**
 * Calculate confidence from multiple LLM judgment rounds.
 *
 * @param results - Array of boolean judgments (true = error)
 * @param threshold - Consistency threshold, default 0.7
 * @returns [finalJudgment, confidenceLevel]
 */
export function calculateLlmConfidence(
  results: boolean[],
  threshold = 0.7,
): [boolean, ConfidenceLevel] {
  if (results.length === 0) {
    return [false, ConfidenceLevel.LOW]
  }

  const trueCount = results.filter(Boolean).length
  const trueRatio = trueCount / results.length

  const isError = trueRatio >= 0.5
  const consistency = Math.max(trueRatio, 1 - trueRatio)

  const confidence =
    consistency >= threshold ? ConfidenceLevel.MEDIUM : ConfidenceLevel.LOW

  return [isError, confidence]
}

/**
 * Merge rule engine and LLM results.
 *
 * Priority:
 * 1. Rule engine HIGH confidence result
 * 2. LLM result (if rule engine cannot determine)
 */
export function mergeResults(
  ruleResult: ConfidenceResult | null,
  llmResult: ConfidenceResult | null,
): ConfidenceResult {
  if (ruleResult && ruleResult.confidence === ConfidenceLevel.HIGH) {
    return ruleResult
  }

  if (llmResult) {
    return llmResult
  }

  return {
    isError: false,
    confidence: ConfidenceLevel.LOW,
    reason: '无法判断',
    source: 'unknown',
    details: {},
  }
}
