import type { LlmAnalysisMode } from '../llm/types'

export interface ModelInfo {
  name: string
  filename: string
  version: string
  size: number
  sha256: string
  downloadUrl?: string      // Set only after distribution approval and source verification.
  mirrorUrl?: string        // Optional approved source; no default is configured.
  cnPrimaryUrl?: string     // Optional approved regional source.
  description: string
  /** Declared task scope for this model artifact, not a quality guarantee. */
  supportedTasks?: readonly LlmAnalysisMode[]
}

export const DEFAULT_MODEL: ModelInfo = {
  name: 'CellSentry MiniCPM5-2B Cancellation v2',
  filename: 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf',
  version: 'formula-cancellation-v2-20261016',
  size: 1_561_314_592,
  sha256: '61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a',
  // Remote distribution stays disabled while the replacement source is evaluated.
  // Local imports keep the pinned size/hash verification.
  description: 'MiniCPM5-2B formula review v2 (Q4_K_M, thinking disabled)',
  supportedTasks: ['audit'],
}
