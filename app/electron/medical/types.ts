/**
 * Domain types for the v2.0 medical pseudonymization pipeline.
 *
 * These types are the contract between the orchestrator, the regex pass, the
 * mapping engine, the OCR bridge, and the audit logger. Each subsystem in this
 * folder imports from here.
 *
 * Lean rebuild (D31-D35): D21 safety-net + AD3 collision pre-scan + AD4
 * date_handler removed. D19 reinterpreted as literal string replaceAll.
 */

import type { CnPattern, CnPiiType } from './regex/patterns'

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export interface AdditionalEntity {
  real: string
  pseudonym: string
}

export interface PatientEntry {
  patient_id: string
  real_name: string
  aliases: string[]
  pseudonym: string
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
// Redaction
// ---------------------------------------------------------------------------

export type ReplacementReason =
  | 'mapping' // matched a name in the user mapping
  | 'regex' // matched a CN identifier regex with validator

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
  /** Latency breakdown per stage (ms). */
  timings: {
    ocr_ms?: number
    regex_ms: number
    mapping_ms: number
    total_ms: number
  }
}

// ---------------------------------------------------------------------------
// OCR (D35)
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
  | 'redact'
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
  | { kind: 'docx'; path: string }
  | { kind: 'text'; content: string }

export interface PipelineRequest {
  source: IngestSource
  mapping_path: string
}

// Re-exports for ergonomic imports.
export type { CnPattern, CnPiiType }
