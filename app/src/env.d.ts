/// <reference types="vite/client" />

// Renderer-side ambient types for CellSentry v2.0 (lean rebuild — D31-D35).
//
// The authoritative copy lives in electron/medical/types.ts; preload/env.d.ts
// mirrors this for the main+preload tsconfig. Keep all three in sync.

interface MedicalIngestSource {
  kind: 'image' | 'pdf' | 'text'
  path?: string
  content?: string
}

interface MedicalReplacement {
  original: string
  pseudonym: string
  span: [number, number]
  reason: 'mapping' | 'regex'
  pattern_type?: string
}

interface MedicalRedactionResult {
  output: string
  replacements: MedicalReplacement[]
  timings: {
    ocr_ms?: number
    regex_ms: number
    mapping_ms: number
    total_ms: number
  }
}

interface MedicalPipelineRequest {
  source: MedicalIngestSource
  mapping_path: string
}

interface MedicalAuditEntry {
  timestamp: string
  action: 'ingest' | 'redact' | 'export'
  patient_id?: string
  content_hash?: string
  details?: Record<string, unknown>
}

interface MedicalAPI {
  ingest: (source: MedicalIngestSource) => Promise<{ text: string; ocr_used: boolean } | { error: string }>
  redact: (request: MedicalPipelineRequest) => Promise<MedicalRedactionResult | { error: string }>
  redactInline: (sourceText: string, mappingText: string) =>
    Promise<MedicalRedactionResult | { error: string }>
  getAuditLog: (archiveDir: string, limit?: number) => Promise<MedicalAuditEntry[] | { error: string }>
  exportMap: (mappingPath: string, destPath: string) => Promise<{ success: boolean; error?: string }>
}

// ──────────────────────────────────────────────────────────────────────────

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

  // LLM bridge (v2 medical pipeline uses this for OCR only)
  getLlmStatus: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>
  startLlm: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>

  // Medical pipeline (v2 lean rebuild — D31-D35).
  medical: MedicalAPI
}

interface TestAPI {
  getRouterPath: () => Promise<string>
  resetState: () => void
}

interface Window {
  api: SidecarAPI
  __TEST_API__?: TestAPI
}
