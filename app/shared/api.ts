import type { AuditExportRequest, PiiRedactionRequest, ExportResult } from './export'
import type { RendererIssue } from '../electron/engine/ruleEngine'
import type { LlmStatus } from '../electron/llm/types'
import type { EngineLocale } from './locale'
import type { ModelDownloadResult } from './modelDownload'

export type ModelSetupPhase = 'idle' | 'copying' | 'verifying' | 'ready' | 'not-bundled' | 'failed'

export interface ModelSetupStatus {
  phase: ModelSetupPhase
  copiedBytes?: number
  totalBytes?: number
}

export interface ModelStatus {
  downloadAvailable: boolean
  exists: boolean
  loaded: boolean
  available: boolean
  backend: string
  name: string
  size: string
  reason?: string
  error?: string
  setup: ModelSetupStatus
}
export interface EngineDoneEvent {
  scanId: string
  engine: 'audit' | 'pii'
  result?: unknown
  error?: string
}


export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

export interface SidecarAPI {
  getHealth: () => Promise<{ status: string; version: string }>
  getModelStatus: () => Promise<ModelStatus>
  setEngineLocale: (locale: EngineLocale) => Promise<{ success: boolean; locale?: EngineLocale; error?: string }>
  analyzeFile: (filePath: string, scanId: string) => Promise<AnalysisResult>
  getFileInfo: (filePath: string) => Promise<FileInfo>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  getFileCells: (filePath: string, sheet: string, range: string) => Promise<FileCellsResult>
  generateReport: (data: { issues: unknown[]; fileName: string }) => Promise<string>
  openFileDialog: () => Promise<string | null>
  openFilesDialog: () => Promise<string[] | null>
  openFolderDialog: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<FolderScanResult>
  checkModelExists: () => Promise<{ exists: boolean }>
  importModel: () => Promise<{ success: boolean; cancelled?: boolean; error?: string }>
  downloadModel: () => Promise<ModelDownloadResult>
  cancelModelDownload: () => Promise<void>
  onModelDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => () => void
  notifyModelReady: () => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  onTestTriggerAnalysis?: (callback: (filePath: string) => void) => () => void
  onTestResetState?: (callback: () => void) => () => void
  openFilePath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getFilePathFromDrop: (file: File) => string
  platform: string
  zoom: {
    get: () => Promise<number>
    set: (level: number) => Promise<void>
  }
  // LLM
  getLlmStatus: () => Promise<LlmStatus>
  startLlm: () => Promise<LlmStatus>
  onZoomChange: (callback: (delta: number) => void) => () => void
  // Workbook PII redaction
  redactPii: (request: PiiRedactionRequest) => Promise<ExportResult>
  exportAudit: (request: AuditExportRequest) => Promise<ExportResult>
  // Unified scan
  analyzeAll: (filePath: string, scanId: string) => Promise<{ success: boolean; error?: string; errorCode?: 'model-stop-failed' }>
  cancelAnalysis: (scanId: string) => Promise<{ success: boolean; error?: string }>
  onEngineDone: (callback: (data: EngineDoneEvent) => void) => () => void
}

export interface FolderScanResult {
  success: boolean
  files: Array<{ path: string; name: string; size: number }>
  total: number
  error?: string
}

export interface ModelDownloadProgress {
  type?: string
  downloaded?: number
  total?: number
  phase?: string
  percent?: number
  message?: string
  status?: string
  error?: string
}

export interface AnalysisResult {
  success: boolean
  issues: RendererIssue[]
  summary?: { error: number; warning: number; info: number; total: number }
  error?: string
  errorCode?: 'model-stop-failed'
  aiWarning?: string
  auditReview?: import('./auditReview').AuditReviewSummary
}

export interface FileCellsResult {
  success: boolean
  columns?: string[]
  rows?: { value: string; formula: string }[][]
  sheetName?: string
  error?: string
}

export interface FileInfo {
  success?: boolean
  error?: string
  exists?: boolean
  name?: string
  fileName?: string
  size?: string
  fileSize?: number
  sheets?: Array<{ name: string; rows: number; cols: number; columns?: number; cells?: number }>
  cellCount?: number
  totalCells?: number
}

export interface ScanProgress {
  scanId: string
  stage?: string
  phase?: string
  progress?: number
  percent?: number
  message: string
  auditReview?: import('./auditReview').AuditReviewProgress
}

export interface TestAPI {
  getRouterPath: () => Promise<string>
  getScanState: () => Promise<string>
  triggerFileAnalysis: (filePath: string) => Promise<void>
  resetState: () => void
}
