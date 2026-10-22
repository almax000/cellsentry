/** Bounded local-AI review accounting for deterministic audit findings. */
export type AuditReviewStopReason =
  | 'complete'
  | 'candidate-limit'
  | 'time-budget'
  | 'cancelled'
  | 'model-unavailable'

export interface AuditReviewSummary {
  total: number
  selected: number
  attempted: number
  /** Candidates with a completed, identity-valid judgment. */
  reviewed: number
  /** Candidates that were attempted but did not yield a valid judgment. */
  failed: number
  /** Candidates that were never attempted. */
  skipped: number
  stopReason: AuditReviewStopReason
}

/** Incremental counters; only a terminal update includes a stop reason. */
export interface AuditReviewProgress extends Omit<AuditReviewSummary, 'stopReason'> {
  stopReason?: AuditReviewStopReason
}
