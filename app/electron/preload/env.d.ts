// Type declarations for preload scripts (compiled under tsconfig.node.json)

interface ScanProgress {
  stage?: string
  phase?: string
  progress?: number
  percent?: number
  message: string
}

interface ModelDownloadProgress {
  type: string
  phase?: string
  percent?: number
  message?: string
  status?: string
  error?: string
}

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

interface SidecarAPI {
  getHealth: () => Promise<{ status: string; version: string }>
  getModelStatus: () => Promise<{ loaded: boolean; name: string; size: string }>
  analyzeFile: (filePath: string) => Promise<unknown>
  getFileInfo: (filePath: string) => Promise<unknown>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  getFileCells: (filePath: string, sheet: string, range: string) => Promise<unknown>
  generateReport: (data: { issues: unknown[]; fileName: string }) => Promise<string>
  openFileDialog: () => Promise<string | null>
  openFilesDialog: () => Promise<string[] | null>
  openFolderDialog: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<unknown>
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
  // LLM
  getLlmStatus: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>
  startLlm: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>
  onZoomChange: (callback: (delta: number) => void) => () => void
  // PII
  analyzePii: (filePath: string) => Promise<unknown>
  redactPii: (filePath: string, outputPath: string) => Promise<unknown>
  // Extraction
  analyzeExtraction: (filePath: string) => Promise<unknown>
  exportExtraction: (filePath: string, format: string, outputPath: string) => Promise<unknown>
}

interface TestAPI {
  getRouterPath: () => Promise<string>
  getScanState: () => Promise<string>
  triggerFileAnalysis: (filePath: string) => Promise<void>
  triggerPiiScan: (filePath: string) => void
  triggerExtractionScan: (filePath: string) => void
  resetState: () => void
}
