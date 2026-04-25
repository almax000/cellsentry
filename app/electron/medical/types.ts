/**
 * Domain types for the v2.0 medical pseudonymization pipeline.
 *
 * These types are the contract between the orchestrator, the regex pass, the
 * mapping engine, the OCR bridge, the safety-net LLM, and the audit logger.
 * Each subsystem in this folder imports from here.
 */

import type { CnPattern, CnPiiType } from './regex/patterns'

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export type DateMode = 'preserve' | 'offset_days' | 'bucket_month'

export interface AdditionalEntity {
  real: string
  pseudonym: string
}

export interface PatientEntry {
  patient_id: string
  real_name: string
  aliases: string[]
  pseudonym: string
  date_mode: DateMode
  /** Days to offset when date_mode === 'offset_days'. Stable per patient. */
  date_offset_days?: number
  additional_entities: AdditionalEntity[]
}

export interface PseudonymMap {
  version: 1
  next_pseudonym_index: number
  patients: PatientEntry[]
  /** Path the map was loaded from / will be written to. */
  source_path: string
}

// ---------------------------------------------------------------------------
// Collision pre-scan (AD3)
// ---------------------------------------------------------------------------

export interface CollisionWarning {
  /** The longer token in the input that contains a mapping key as substring. */
  longer: string
  /** The shorter mapping key that appears as substring in `longer`. */
  shorter: string
  /** ~30-char windows around each occurrence of `longer` in the input. */
  contexts: string[]
}

export type CollisionResolution =
  | { kind: 'add_to_mapping'; longer: string; pseudonym: string }
  | { kind: 'approve_partial_match'; longer: string }

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export type ReplacementReason =
  | 'mapping' // matched a name in the user mapping
  | 'regex' // matched a CN identifier regex with validator
  | 'safety_net' // flagged by LLM safety-net pass
  | 'date' // transformed by dateHandler

export interface Replacement {
  original: string
  pseudonym: string
  span: [number, number]
  reason: ReplacementReason
  pattern_type?: CnPiiType
}

export interface RedactionResult {
  /** Final redacted text after all passes. */
  output: string
  replacements: Replacement[]
  /** Names flagged by safety-net but not yet resolved by user. */
  pending_flags: SafetyNetFlag[]
  /** Empty unless collision pre-scan blocked the run. */
  collisions: CollisionWarning[]
  /** Latency breakdown per stage (ms). */
  timings: {
    ocr_ms?: number
    regex_ms: number
    mapping_ms: number
    safety_net_ms?: number
    total_ms: number
  }
}

// ---------------------------------------------------------------------------
// Safety-net (AD2 / D21)
// ---------------------------------------------------------------------------

export interface SafetyNetFlag {
  name: string
  context: string
  confidence: number
  suggested_replacement?: string
}

// ---------------------------------------------------------------------------
// OCR (AD6)
// ---------------------------------------------------------------------------

export interface OcrPage {
  index: number
  text: string
  bbox?: [number, number, number, number]
  confidence?: number
}

export interface OcrResult {
  text: string
  pages: OcrPage[]
  latency_ms: number
}

export interface OcrError {
  error: string
  code: string
}

// ---------------------------------------------------------------------------
// Audit log (security-assessment P2#8)
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'ingest'
  | 'collision_warning'
  | 'collision_resolved'
  | 'redact'
  | 'safety_net_flag'
  | 'safety_net_resolved'
  | 'export'

export interface AuditEntry {
  timestamp: string
  action: AuditAction
  patient_id?: string
  /** Hash of source content (never raw); for traceability without leakage. */
  content_hash?: string
  details?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Pipeline input
// ---------------------------------------------------------------------------

export type IngestSource =
  | { kind: 'image'; path: string }
  | { kind: 'pdf'; path: string }
  | { kind: 'text'; content: string }

export interface PipelineRequest {
  source: IngestSource
  mapping_path: string
  /** If false, pipeline runs through to redacted output (no preview gate). */
  preview_only: boolean
}

// Re-exports for ergonomic imports.
export type { CnPattern, CnPiiType }
