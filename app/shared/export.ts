export type AuditExportFormat = 'html' | 'pdf' | 'xlsx'
export type ExtractionExportFormat = 'json' | 'csv'
export type ReviewStatus = 'pending' | 'confirmed' | 'not-applicable'
export type AuditExportScope = 'all' | 'confirmed'

export interface ReviewDecision {
  status: ReviewStatus
  note: string
}

export interface ExportIssue {
  sheetName: string
  cell: string
  severity: 'error' | 'warning' | 'info'
  ruleId: string
  message: string
  suggestion: string
  confidence: number
  /** Formula as read from the workbook; absent for a value-only finding. */
  formula?: string
  /** Saved/cached workbook value observed during scan; never a recalculated value. */
  currentValue?: unknown
  llmVerified?: boolean
  llmDisputed?: boolean
  llmReviewRequired?: boolean
  llmConfidence?: number
  llmReasoning?: string
}

export interface AuditExportRequest {
  filePath: string
  fileName: string
  format: AuditExportFormat
  issues: ExportIssue[]
  /** Defaults to all findings for backwards-compatible callers. */
  scope?: AuditExportScope
  /** The complete scan count. It must match `issues.length` when supplied. */
  totalFindings?: number
  /** SHA-256 of the source workbook recorded at scan time, when available. */
  sourceFingerprint?: string
  /** In-memory, scan-scoped human decisions keyed by reviewKey(issue). */
  reviewDecisions?: Record<string, ReviewDecision>
  /** Optional scan-wide AI review progress; individual findings keep their own AI opinion. */
  auditReview?: {
    total: number
    selected: number
    attempted: number
    reviewed: number
    failed: number
    skipped: number
    stopReason?: string
  }
}

export interface RedactionFinding {
  sheetName: string
  cell: string
  piiType: string
  originalValue: string
  maskedValue: string
  pattern: string
}

export interface PiiRedactionRequest {
  filePath: string
  fileName: string
  findings: RedactionFinding[]
}

export interface ExtractionExportField {
  key: string
  label: string
  value: string
  cell: string
  sheetName: string
  confidence: number
}

export interface ExtractionExportTable {
  sheetName: string
  headerRow: number
  headers: string[]
  rows: string[][]
  startCell: string
  endCell: string
}

export interface ExtractionExportRequest {
  filePath: string
  fileName: string
  format: ExtractionExportFormat
  fields: ExtractionExportField[]
  tables: ExtractionExportTable[]
}

export interface ExportResult {
  success: boolean
  cancelled?: boolean
  outputPath?: string
  error?: string
  count?: number
}
