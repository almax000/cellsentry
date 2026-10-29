import type {
  AuditExportRequest,
  AuditExportScope,
  ExportIssue,
  ReviewDecision,
  ReviewStatus,
} from './export'

export { type AuditExportScope, type ReviewDecision, type ReviewStatus }

export interface AuditSnapshotRule {
  ruleId: string
  severity: ExportIssue['severity']
  confidence: number
  formula: string
  observedValue: string
  message: string
  suggestion: string
}

export interface AuditSnapshotAi {
  status: 'not-reviewed' | 'reviewed' | 'disputed' | 'review-required'
  confidence?: number
  reasoning: string
}

export interface AuditSnapshotRow {
  reviewKey: string
  sheetName: string
  cell: string
  rule: AuditSnapshotRule
  ai: AuditSnapshotAi
  review: ReviewDecision
}

export interface AuditSnapshot {
  source: {
    filePath: string
    fileName: string
    sourceFingerprint?: string
  }
  format: AuditExportRequest['format']
  scope: AuditExportScope
  auditReview?: AuditExportRequest['auditReview']
  totalFindings: number
  exportedFindings: number
  excludedFindings: number
  rows: AuditSnapshotRow[]
}

function part(value: string): string {
  return `${value.length}:${value}`
}

/**
 * Stable only for the same scanned workbook content. It deliberately contains
 * the original formula, so a later workbook edit cannot inherit a decision.
 */
export function reviewKey(issue: Pick<ExportIssue, 'sheetName' | 'cell' | 'ruleId' | 'formula'>): string {
  return [issue.sheetName, issue.cell, issue.ruleId, issue.formula || ''].map(part).join('|')
}

function reviewFor(issue: ExportIssue, decisions: Record<string, ReviewDecision> | undefined): ReviewDecision {
  const decision = decisions?.[reviewKey(issue)]
  return decision ? { status: decision.status, note: decision.note } : { status: 'pending', note: '' }
}

function aiFor(issue: ExportIssue): AuditSnapshotAi {
  if (issue.llmDisputed) return { status: 'disputed', confidence: issue.llmConfidence, reasoning: issue.llmReasoning || '' }
  if (issue.llmVerified) return { status: 'reviewed', confidence: issue.llmConfidence, reasoning: issue.llmReasoning || '' }
  if (issue.llmReviewRequired) return { status: 'review-required', reasoning: issue.llmReasoning || '' }
  return { status: 'not-reviewed', reasoning: issue.llmReasoning || '' }
}

function observedValue(value: ExportIssue['currentValue']): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable saved value]'
  }
}

/**
 * Builds the single frozen export view consumed by HTML, PDF and XLSX. The
 * caller must supply every scan finding: a partial list cannot honestly claim
 * to be an all-findings export.
 */
export function buildAuditSnapshot(request: AuditExportRequest): AuditSnapshot {
  const totalFindings = request.totalFindings ?? request.issues.length
  if (!Number.isInteger(totalFindings) || totalFindings < 0 || totalFindings !== request.issues.length) {
    throw new Error('Audit export requires the complete scan finding set')
  }
  const scope = request.scope || 'all'
  const rows = request.issues.map((issue): AuditSnapshotRow => ({
    reviewKey: reviewKey(issue),
    sheetName: issue.sheetName,
    cell: issue.cell,
    rule: {
      ruleId: issue.ruleId,
      severity: issue.severity,
      confidence: issue.confidence,
      formula: issue.formula || '',
      observedValue: observedValue(issue.currentValue),
      message: issue.message,
      suggestion: issue.suggestion,
    },
    ai: aiFor(issue),
    review: reviewFor(issue, request.reviewDecisions),
  }))
  const exportedRows = scope === 'confirmed' ? rows.filter((row) => row.review.status === 'confirmed') : rows
  return {
    source: { filePath: request.filePath, fileName: request.fileName, sourceFingerprint: request.sourceFingerprint },
    format: request.format,
    scope,
    auditReview: request.auditReview ? { ...request.auditReview } : undefined,
    totalFindings,
    exportedFindings: exportedRows.length,
    excludedFindings: totalFindings - exportedRows.length,
    rows: exportedRows,
  }
}
