// Type declarations for preload scripts (compiled under tsconfig.node.json)

interface ModelDownloadProgress {
  downloaded?: number
  total?: number
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
  // Health + version
  getHealth: () => Promise<{ status: string; engine: string; version: string }>
  getModelStatus: () => Promise<{ loaded: boolean; backend: string }>

  // Dialogs
  openFileDialog: () => Promise<string | null>
  openFilesDialog: () => Promise<string[] | null>
  openFolderDialog: () => Promise<string | null>

  // Model download
  checkModelExists: () => Promise<{ exists: boolean }>
  downloadModel: () => Promise<{ success: boolean; error?: string }>
  onModelDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => () => void
  notifyModelReady: () => void

  // Auto-updater
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void

  // Shell
  openFilePath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getFilePathFromDrop: (file: File) => string
  platform: string

  // Zoom
  zoom: {
    get: () => Promise<number>
    set: (level: number) => Promise<void>
  }
  onZoomChange: (callback: (delta: number) => void) => () => void

  // LLM bridge (used by v2 medical pipeline)
  getLlmStatus: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>
  startLlm: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>
}

interface TestAPI {
  getRouterPath: () => Promise<string>
  resetState: () => void
}
