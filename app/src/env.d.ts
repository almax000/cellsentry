/// <reference types="vite/client" />

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

interface SidecarAPI {
  getHealth: () => Promise<{ status: string; version: string }>
  getModelStatus: () => Promise<{ loaded: boolean; name: string; size: string }>
  analyzeFile: (filePath: string) => Promise<AnalysisResult>
  getFileInfo: (filePath: string) => Promise<FileInfo>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  getFileCells: (filePath: string, sheet: string, range: string) => Promise<FileCellsResult>
  generateReport: (data: { issues: unknown[]; fileName: string }) => Promise<string>
  openFileDialog: () => Promise<string | null>
  openFilesDialog: () => Promise<string[] | null>
  openFolderDialog: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<FolderScanResult>
  checkModelExists: () => Promise<{ exists: boolean; type: string }>
  downloadModel: () => Promise<{ success: boolean; status: string }>
  onModelDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => () => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  onTestTriggerAnalysis?: (callback: (filePath: string) => void) => () => void
  onTestTriggerPiiScan?: (callback: (filePath: string) => void) => () => void
  onTestTriggerExtractionScan?: (callback: (filePath: string) => void) => () => void
  onTestResetState?: (callback: () => void) => () => void
  openFilePath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getFilePathFromDrop: (file: File) => string
  platform: string
  zoom: {
    get: () => Promise<number>
    set: (level: number) => Promise<void>
  }
}

interface FolderScanResult {
  success: boolean
  files: Array<{ path: string; name: string; size: number }>
  total: number
  error?: string
}

interface ModelDownloadProgress {
  type: string
  phase?: string
  percent?: number
  message?: string
  status?: string
  error?: string
}

interface AnalysisResult {
  success: boolean
  issues: Issue[]
  total_issues: number
  duration?: number
  scannedAt?: string
  summary?: {
    errors: number
    warnings: number
    info: number
    total: number
  }
  error?: string
}

interface FileCellsResult {
  success: boolean
  columns?: string[]
  rows?: { value: string; formula: string }[][]
  sheetName?: string
  error?: string
}

interface Issue {
  sheet_name: string
  cell_address: string
  severity: 'high' | 'medium' | 'low'
  rule_id: string
  message: string
  suggestion: string
  confidence: number
}

interface FileInfo {
  success?: boolean
  exists?: boolean
  name?: string
  fileName?: string
  size?: string
  fileSize?: number
  sheets?: Array<string | { name: string; rows: number; columns: number; cells: number }>
  cellCount?: number
  totalCells?: number
}

interface ScanProgress {
  stage?: string
  phase?: string
  progress?: number
  percent?: number
  message: string
}

interface TestAPI {
  getRouterPath: () => Promise<string>
  getScanState: () => Promise<string>
  triggerFileAnalysis: (filePath: string) => Promise<void>
  triggerPiiScan: (filePath: string) => void
  triggerExtractionScan: (filePath: string) => void
  resetState: () => void
}

declare global {
  interface Window {
    api: SidecarAPI
    __TEST_API__?: TestAPI
  }
}
