/**
 * LLM lifecycle management — lazy start, graceful shutdown, convenience API.
 *
 * The main window warms the native runtime in the background; requests can also start it lazily.
 * If the native runtime or model is unavailable, analysis uses the rule engine.
 */

import { app } from 'electron'
import { llmBridge } from './bridge'
import type { AuditReviewProgress, AuditReviewSummary } from '../../shared/auditReview'
import type {
  LlmAnalysisMode,
  LlmIssueInput,
  LlmJudgment,
  LlmCellContext,
  LlmStatus,
  PiiLlmFinding,
  ExtractionLlmResult,
} from './types'
export { mergeJudgments, type LlmAnnotatedIssue } from './reconcile'

const LLM_BATCH_SIZE = 8
export const DEFAULT_AUDIT_REVIEW_MAX_CANDIDATES = 20
export const DEFAULT_AUDIT_REVIEW_TIME_BUDGET_MS = 60_000
let analysisEpoch = 0

export interface AuditReviewOptions {
  /** Product cap, before any request is sent. */
  maxCandidates?: number
  /** Whole-operation budget, including lazy model startup. */
  timeBudgetMs?: number
  onProgress?: (progress: AuditReviewProgress) => void
}

/**
 * The deadline elapsed but the native runtime did not confirm that it stopped.
 * Callers must keep the scan session locked until an explicit later stop works.
 */
export class AuditReviewStopError extends Error {
  readonly name = 'AuditReviewStopError'

  constructor(
    message: string,
    readonly judgments: LlmJudgment[],
    readonly summary: AuditReviewSummary,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

type TimedAuditResponse =
  | { timedOut: true }
  | { timedOut: false; response: Awaited<ReturnType<typeof llmBridge.send>> }

function boundedWholeNumber(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function hasMatchingSingleJudgment(
  issue: LlmIssueInput,
  response: Awaited<ReturnType<typeof llmBridge.send>>,
): boolean {
  const judgments = response.result?.judgments
  if (response.error) return false
  if (!judgments || judgments.length !== 1) return false
  const judgment = judgments[0]
  return judgment.sheetName === issue.sheetName
    && judgment.cellAddress === issue.cellAddress
    && judgment.ruleId === issue.ruleId
    && typeof judgment.isValid === 'boolean'
    && Number.isFinite(judgment.adjustedConfidence)
    && judgment.adjustedConfidence >= 0
    && judgment.adjustedConfidence <= 1
    && typeof judgment.reasoning === 'string'
    && judgment.reasoning.trim().length > 0
}

async function sendAuditBeforeDeadline(
  issue: LlmIssueInput,
  remainingMs: number,
): Promise<TimedAuditResponse> {
  if (remainingMs <= 0) return { timedOut: true }

  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let shutdownPromise: Promise<void> | undefined
  const responsePromise = llmBridge.send({
    method: 'analyze',
    params: { issues: [issue], mode: 'audit' },
  }).catch(error => ({
    id: -1,
    error: error instanceof Error ? error.message : String(error),
  }))
  const timeoutPromise = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      // Shutdown aborts the active HTTP operation and drains the serialized
      // native queue. Do not report the deadline until it has settled.
      shutdownPromise = llmBridge.shutdown()
      shutdownPromise.then(resolve, reject)
    }, remainingMs)
  })

  try {
    const response = await Promise.race([
      responsePromise,
      timeoutPromise.then(() => undefined),
    ])
    if (timedOut) {
      // A response can settle while shutdown is in flight. The deadline still
      // owns this candidate; wait for both sides so no GPU request survives.
      await shutdownPromise
      await responsePromise.catch(() => undefined)
      return { timedOut: true }
    }
    return { timedOut: false, response: response as Awaited<ReturnType<typeof llmBridge.send>> }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Review formula-audit candidates one at a time with a bounded local-model
 * budget. Each valid response is retained even when a later candidate fails.
 */
export async function reviewAuditIssues(
  issues: LlmIssueInput[],
  options: AuditReviewOptions = {},
): Promise<{ judgments: LlmJudgment[]; summary: AuditReviewSummary }> {
  const total = issues.length
  const maxCandidates = boundedWholeNumber(options.maxCandidates, DEFAULT_AUDIT_REVIEW_MAX_CANDIDATES)
  const selected = Math.min(total, maxCandidates)
  const timeBudgetMs = boundedWholeNumber(options.timeBudgetMs, DEFAULT_AUDIT_REVIEW_TIME_BUDGET_MS)
  const startedAt = Date.now()
  const epoch = analysisEpoch
  const judgments: LlmJudgment[] = []
  let attempted = 0
  let reviewed = 0
  let failed = 0

  const summary = (stopReason: AuditReviewSummary['stopReason']): AuditReviewSummary => ({
    total,
    selected,
    attempted,
    reviewed,
    failed,
    skipped: total - attempted,
    stopReason,
  })
  const progress = (stopReason?: AuditReviewSummary['stopReason']): void => {
    if (epoch !== analysisEpoch) return
    try { options.onProgress?.(stopReason ? summary(stopReason) : {
      ...summary('complete'), stopReason: undefined,
    }) } catch { /* progress observers must not interrupt a local scan */ }
  }
  const cancelled = (): { judgments: LlmJudgment[]; summary: AuditReviewSummary } => ({
    judgments: [],
    summary: summary('cancelled'),
  })

  // The renderer can show the bounded scope during slow runtime startup.
  progress()

  for (let index = 0; index < selected; index += 1) {
    if (epoch !== analysisEpoch) return cancelled()
    const remainingMs = timeBudgetMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      const result = { judgments, summary: summary('time-budget') }
      progress('time-budget')
      return result
    }

    const issue = issues[index]
    attempted += 1
    let response: Awaited<ReturnType<typeof llmBridge.send>> | undefined
    try {
      const result = await sendAuditBeforeDeadline(issue, remainingMs)
      if (result.timedOut) {
        failed += 1
        if (epoch !== analysisEpoch) return cancelled()
        const timedOut = { judgments, summary: summary('time-budget') }
        progress('time-budget')
        return timedOut
      }
      response = result.response
    } catch (error) {
      // A shutdown failure means the native request is not known to be stopped;
      // callers need the partial result only for diagnostics, never fallback.
      if (epoch !== analysisEpoch) return cancelled()
      failed += 1
      throw new AuditReviewStopError(
        'Local AI did not confirm it stopped before the review deadline.',
        [...judgments],
        summary('time-budget'),
        error,
      )
    }

    const validJudgment = hasMatchingSingleJudgment(issue, response)
    if (validJudgment) {
      reviewed += 1
      judgments.push(response.result!.judgments![0])
    } else {
      failed += 1
    }

    if (epoch !== analysisEpoch) return cancelled()
    if (response.error && (!llmBridge.status.available || !llmBridge.status.modelLoaded)) {
      const unavailable = { judgments, summary: summary('model-unavailable') }
      progress('model-unavailable')
      return unavailable
    }
    progress()
  }

  const stopReason: AuditReviewSummary['stopReason'] = selected < total ? 'candidate-limit' : 'complete'
  const result = { judgments, summary: summary(stopReason) }
  progress(stopReason)
  return result
}

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

/**
 * Whether a scan should attempt local AI for this task at all: the bridge's
 * model file is installed and the model declares the task. When false, AI is
 * not part of the scan, so callers report neither review accounting nor a
 * warning. A later start can still fail; that remains a genuine AI failure.
 */
export function isLocalAiReadyFor(mode: LlmAnalysisMode): boolean {
  // A test double standing in for the runtime may omit the pre-check; it is
  // installed to answer requests, so treat it as ready.
  if (typeof llmBridge.canAttempt !== 'function') return true
  return llmBridge.canAttempt(mode)
}

export async function getLlmStatus(): Promise<LlmStatus> {
  // Status is observational. Starting a model from a status poll makes a
  // cancelled scan race a later UI refresh.
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
 * Cancel active and queued local inference for the current scan. The native
 * process is stopped to release the serial queue, but a later startLlm() or
 * analysis request may start a fresh runtime.
 */
export async function cancelLlmAnalysis(): Promise<void> {
  analysisEpoch++
  await llmBridge.shutdown()
}

/**
 * Send rule-engine issues to the LLM for validation.
 * Batches issues into groups of LLM_BATCH_SIZE to avoid overwhelming the model.
 */
export async function analyzeWithLlm(
  issues: LlmIssueInput[],
): Promise<LlmJudgment[]> {
  if (issues.length === 0) return []
  const epoch = analysisEpoch

  // Batch into groups
  const allJudgments: LlmJudgment[] = []
  // The formula-specialized GGUF was evaluated with one issue per request.
  for (let i = 0; i < issues.length; i += 1) {
    if (epoch !== analysisEpoch) return []
    const batch = issues.slice(i, i + 1)

    const response = await llmBridge.send({
      method: 'analyze',
      params: {
        issues: batch,
        mode: 'audit',
      },
    })

    if (epoch !== analysisEpoch) return []
    if (response.error) throw new Error(response.error)

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
  const epoch = analysisEpoch

  const allFindings: PiiLlmFinding[] = []
  for (let i = 0; i < cells.length; i += LLM_BATCH_SIZE) {
    if (epoch !== analysisEpoch) return []
    const batch = cells.slice(i, i + LLM_BATCH_SIZE)

    const response = await llmBridge.send({
      method: 'analyze',
      params: {
        cells: batch,
        mode: 'pii',
      },
    })
    if (epoch !== analysisEpoch) return []
    if (response.error) throw new Error(response.error)

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
  const epoch = analysisEpoch

  // Send up to 200 cells (no batching needed — single request)
  const sample = cells.slice(0, 200)

  const response = await llmBridge.send({
    method: 'analyze',
    params: {
      cells: sample,
      mode: 'extraction',
    },
  })
  if (epoch !== analysisEpoch) return null
  if (response.error) throw new Error(response.error)

  if (response.error || !response.result?.extraction) {
    return null
  }

  return response.result.extraction
}

/**
 * Merge LLM judgments back into engine issues.
 *
 * Exact sheet/rule/cell matches receive review metadata. A negative judgment
 * remains a disputed deterministic finding rather than removing it.
 */
/**
 * Build the prompt text for a set of issues (useful for debugging/logging).
 */
export { buildAuditPrompt } from './prompts'
