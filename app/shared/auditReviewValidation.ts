import type { AuditReviewProgress, AuditReviewSummary, AuditReviewStopReason } from './auditReview'

const reasons = new Set<AuditReviewStopReason>(['complete', 'candidate-limit', 'time-budget', 'cancelled', 'model-unavailable'])

/** Reject inconsistent IPC counts rather than showing a misleading completion claim. */
export function readAuditReviewProgress(value: unknown): AuditReviewProgress | undefined {
  if (!value || typeof value !== 'object') return undefined
  const r = value as Record<string, unknown>
  for (const key of ['total', 'selected', 'attempted', 'reviewed', 'failed', 'skipped']) {
    if (!Number.isSafeInteger(r[key]) || (r[key] as number) < 0) return undefined
  }
  const { total, selected, attempted, reviewed, failed, skipped } = r as unknown as AuditReviewProgress
  if (selected > total || attempted > selected || reviewed + failed !== attempted || skipped !== total - attempted) return undefined
  if (r.stopReason !== undefined && !reasons.has(r.stopReason as AuditReviewStopReason)) return undefined
  return { total, selected, attempted, reviewed, failed, skipped, ...(r.stopReason !== undefined && { stopReason: r.stopReason as AuditReviewStopReason }) }
}

export function readAuditReviewSummary(value: unknown): AuditReviewSummary | undefined {
  const result = readAuditReviewProgress(value)
  return result?.stopReason && result.stopReason !== 'cancelled' ? result as AuditReviewSummary : undefined
}
