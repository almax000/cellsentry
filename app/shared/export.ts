export type AuditExportFormat = 'html' | 'pdf' | 'xlsx'
export type ExtractionExportFormat = 'json' | 'csv'

export interface ExportIssue {
  sheetName: string
  cell: string
  severity: 'error' | 'warning' | 'info'
  ruleId: string
  message: string
  suggestion: string
  confidence: number
}

export interface AuditExportRequest {
  filePath: string
  fileName: string
  format: AuditExportFormat
  issues: ExportIssue[]
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
