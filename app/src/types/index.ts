// Severity levels map to the sidecar's high/medium/low confidence
export type SeverityLevel = 'error' | 'warning' | 'info'

export type ScanState = 'idle' | 'loading' | 'scanning' | 'complete' | 'error'

export type ScanPhase = 'rules' | 'enhance' | 'discover'

export type ScanMode = 'audit' | 'pii' | 'extraction'

export type ActiveView = 'audit' | 'pii' | 'extraction'

export interface Issue {
  id: string
  sheetName: string
  cell: string
  formula: string
  ruleId: string
  severity: SeverityLevel
  confidence: number
  message: string
  suggestion: string
  category: string
  layer: 'rule' | 'ai'
  llmVerified?: boolean
  llmConfidence?: number
  llmReasoning?: string
}

export interface AnalysisSummary {
  errors: number
  warnings: number
  info: number
  total: number
}

export interface AnalysisResult {
  success: boolean
  filePath: string
  fileName: string
  issues: Issue[]
  summary: AnalysisSummary
  scannedAt: string
  duration: number
  error?: string
}

export interface FileInfo {
  success: boolean
  fileName: string
  fileSize: number
  sheets: SheetInfo[]
  totalCells: number
}

export interface SheetInfo {
  name: string
  rows: number
  columns: number
  cells: number
}

export interface ScanProgress {
  phase: ScanPhase
  percent: number
  message: string
}

export interface CellData {
  value: string
  formula: string
  hasIssue?: boolean
  issueId?: string
}

export interface FileCellsResult {
  success: boolean
  columns: string[]
  rows: CellData[][]
  sheetName: string
  error?: string
}

// ── Batch Scanning ──

export interface QueuedFile {
  path: string
  name: string
  size: number
  status: 'pending' | 'scanning' | 'complete' | 'error'
  result?: AnalysisResult
  error?: string
}

export interface BatchResult {
  files: QueuedFile[]
  totalFiles: number
  completedFiles: number
  aggregateSummary: AnalysisSummary
  startedAt: string
  completedAt?: string
}

export type BatchState = 'idle' | 'scanning' | 'complete' | 'error'

// ── PII Scanning ──

export type PiiType = 'ssn' | 'phone' | 'email' | 'id_number' | 'credit_card' | 'name' | 'address' | 'iban' | 'bank_card' | 'passport'

export interface PiiFinding {
  id: string
  sheetName: string
  cell: string
  piiType: PiiType
  originalValue: string
  maskedValue: string
  confidence: number
  pattern: string
}

export interface PiiSummary {
  total: number
  byType: Record<PiiType, number>
}

export interface PiiResult {
  success: boolean
  filePath: string
  fileName: string
  findings: PiiFinding[]
  summary: PiiSummary
  scannedAt: string
  duration: number
  error?: string
}

// ── Data Extraction ──

export type DocumentType = 'invoice' | 'receipt' | 'expense_report' | 'purchase_order' | 'payroll' | 'unknown'

export interface ExtractionField {
  key: string
  label: string
  value: string
  cell: string
  sheetName: string
  confidence: number
}

export interface ExtractedTable {
  sheetName: string
  headerRow: number
  headers: string[]
  rows: string[][]
  startCell: string
  endCell: string
}

export interface ExtractionResult {
  success: boolean
  filePath: string
  fileName: string
  documentType: DocumentType
  fields: ExtractionField[]
  tables: ExtractedTable[]
  scannedAt: string
  duration: number
  error?: string
}

// ── Discriminated Union ──

export type ScanResult = AnalysisResult | PiiResult | ExtractionResult
