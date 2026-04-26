/// <reference types="vite/client" />

// Renderer-side ambient types for CellSentry v2.0.
// v1.x types (Issue / AnalysisResult / FileInfo / ScanProgress / FileCellsResult /
// FolderScanResult / analyzePii / analyzeExtraction / analyzeAll / etc.) removed
// in W1 Step 1.1. v2 medical-pipeline types added in W1 Step 1.2 (this file).

// ─── v2 medical types (mirrors `electron/medical/types.ts` shapes) ────────
//
// Why duplicated: tsconfig.web (renderer) and tsconfig.node (main + preload)
// are disjoint includes; renderer can't import from electron/. These ambient
// interfaces are the JSON shape contract across the IPC boundary. The
// authoritative copy lives in electron/medical/types.ts; keep these in sync
// when the canonical types change. Stub IPC handlers throw TODO until W3-W4
// real implementations land.

type MedicalDateMode = 'preserve' | 'offset_days' | 'bucket_month'

interface MedicalIngestSource {
  kind: 'image' | 'pdf' | 'text'
  path?: string
  content?: string
}

interface MedicalCollisionWarning {
  longer: string
  shorter: string
  contexts: string[]
}

interface MedicalReplacement {
  original: string
  pseudonym: string
  span: [number, number]
  reason: 'mapping' | 'regex' | 'safety_net' | 'date'
  pattern_type?: string
}

interface MedicalSafetyNetFlag {
  name: string
  context: string
  confidence: number
  suggested_replacement?: string
}

interface MedicalRedactionResult {
  output: string
  replacements: MedicalReplacement[]
  pending_flags: MedicalSafetyNetFlag[]
  collisions: MedicalCollisionWarning[]
  timings: {
    ocr_ms?: number
    regex_ms: number
    mapping_ms: number
    safety_net_ms?: number
    total_ms: number
  }
}

interface MedicalPipelineRequest {
  source: MedicalIngestSource
  mapping_path: string
  preview_only: boolean
}

interface MedicalAuditEntry {
  timestamp: string
  action:
    | 'ingest'
    | 'collision_warning'
    | 'collision_resolved'
    | 'redact'
    | 'safety_net_flag'
    | 'safety_net_resolved'
    | 'export'
  patient_id?: string
  content_hash?: string
  details?: Record<string, unknown>
}

interface MedicalAPI {
  ingest: (source: MedicalIngestSource) => Promise<{ text: string; ocr_used: boolean } | { error: string }>
  scanCollisions: (mappingPath: string, chunks: string[]) => Promise<MedicalCollisionWarning[] | { error: string }>
  preview: (request: MedicalPipelineRequest) => Promise<MedicalRedactionResult | { error: string }>
  redact: (request: MedicalPipelineRequest) => Promise<MedicalRedactionResult | { error: string }>
  redactInline: (sourceText: string, mappingText: string, preview: boolean) =>
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

  // LLM bridge (v2 medical pipeline uses this for safety-net pass + OCR)
  getLlmStatus: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>
  startLlm: () => Promise<{ available: boolean; backend: string; modelLoaded: boolean }>

  // Medical pipeline (v2). Stubs until W3-W4; calls return `{error: ...}` for now.
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
