// Type declarations for preload scripts (compiled under tsconfig.node.json).
// Mirrors app/src/env.d.ts because tsconfig.web and tsconfig.node are disjoint
// includes — keep the two MedicalAPI declarations in lockstep.

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
  getAuditLog: (archiveDir: string, limit?: number) => Promise<MedicalAuditEntry[] | { error: string }>
  exportMap: (mappingPath: string, destPath: string) => Promise<{ success: boolean; error?: string }>
}

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

  // Medical pipeline (v2). Stubs until W3-W4 real implementations land.
  medical: MedicalAPI
}

interface TestAPI {
  getRouterPath: () => Promise<string>
  resetState: () => void
}
