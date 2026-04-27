/**
 * Pipeline orchestrator (lean rebuild — D31-D35).
 *
 * Stages in plan v3 order, post-ADR:
 *   1. Ingest          — OCR (image/PDF) or pass-through (text)
 *   2. Regex pass      — CN ID + mobile + email + 病历号/医保号/就诊号
 *   3. Mapping pass    — literalReplace (D19 reinterpreted: String.prototype.replaceAll
 *                        with longest-key-first ordering)
 *   4. Audit log       — accumulated AuditEntry per stage transition
 *
 * REVOKED in lean rebuild (do NOT add back without ADR amendment per § 6.4):
 *   - Collision pre-scan (AD3)
 *   - Date handler (AD4)
 *   - Safety-net LLM pass (D21 / AD2)
 */

import { createHash } from 'crypto'

import { loadMapping, parseMappingText } from '../mapping/parser'
import { replaceWithMapping } from '../mapping/literalReplace'
import { applyMasking, findRegexPii } from '../regex/patterns'
import type {
  AuditEntry,
  PipelineRequest,
  PseudonymMap,
  RedactionResult,
  Replacement,
} from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = (): string => new Date().toISOString()

/** sha256[:16] hash for audit log (per security-assessment P2#8 — never raw PII). */
function contentHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

async function readSourceText(request: PipelineRequest): Promise<{ text: string; ocrUsed: boolean }> {
  const src = request.source
  if (src.kind === 'text') {
    return { text: src.content, ocrUsed: false }
  }
  if (src.kind === 'docx') {
    const { extractDocxText } = await import('../ocr/docxLoader')
    const result = await extractDocxText(src.path)
    if (result === null) {
      throw new PipelineError(`Could not extract text from DOCX: ${src.path}`, 'ingest')
    }
    return { text: result.text, ocrUsed: false }
  }
  if (src.kind === 'pdf') {
    // Try digital PDF fallback first; fall back to OCR if no text layer.
    const { tryDigitalPdf } = await import('../ocr/digitalPdfFallback')
    const digital = await tryDigitalPdf(src.path).catch(() => null)
    if (digital !== null) {
      return { text: digital.text, ocrUsed: false }
    }
  }
  // image / scanned PDF → real OCR via the active engine (PaddleOCR-VL default).
  const { ocrViaLlmBridge, isOcrError } = await import('../ocr/bridge')
  const ocr = await ocrViaLlmBridge({ source: { kind: 'path', path: src.path } })
  if (isOcrError(ocr)) {
    throw new PipelineError(`OCR failed: ${ocr.error}`, 'ocr_failed', { code: ocr.code })
  }
  return { text: ocr.text, ocrUsed: true }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly stage:
      | 'ingest' | 'mapping_load' | 'regex' | 'mapping_replace' | 'ocr_failed',
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — Regex pass + masking application
// ---------------------------------------------------------------------------

/**
 * Apply regex findings as inline masking. Returns the rewritten text + a list
 * of Replacement entries with spans pointing into the INPUT (pre-rewrite).
 * Walking right-to-left so earlier spans remain valid as later ones rewrite.
 */
function applyRegexPass(text: string): { rewritten: string; replacements: Replacement[] } {
  const findings = findRegexPii(text)
  if (findings.length === 0) {
    return { rewritten: text, replacements: [] }
  }

  // Right-to-left: replace from the back so left-of-cursor spans are stable.
  const sorted = [...findings].sort((a, b) => b.span[0] - a.span[0])
  let rewritten = text
  const replacements: Replacement[] = []

  for (const f of sorted) {
    const masked = applyMasking(f)
    rewritten = rewritten.slice(0, f.span[0]) + masked + rewritten.slice(f.span[1])
    replacements.push({
      original: f.match,
      pseudonym: masked,
      span: [f.span[0], f.span[1]],
      reason: 'regex',
      pattern_type: f.type,
    })
  }

  // Return left-to-right order for UI display.
  replacements.reverse()
  return { rewritten, replacements }
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

export async function runPipeline(request: PipelineRequest): Promise<RedactionResult> {
  const t_start = Date.now()
  const audit: AuditEntry[] = []
  const allReplacements: Replacement[] = []

  const timings: RedactionResult['timings'] = {
    regex_ms: 0,
    mapping_ms: 0,
    total_ms: 0,
  }

  // Stage 1: Ingest
  const t_ingest = Date.now()
  const { text: rawText, ocrUsed } = await readSourceText(request)
  if (ocrUsed) timings.ocr_ms = Date.now() - t_ingest

  audit.push({
    timestamp: now(),
    action: 'ingest',
    content_hash: contentHash(rawText),
    details: {
      ocr_used: ocrUsed,
      source_kind: request.source.kind,
      char_count: rawText.length,
    },
  })

  // Stage 1.5: Load mapping
  let mapping: PseudonymMap
  try {
    mapping = await loadMapping(request.mapping_path)
  } catch (e) {
    throw new PipelineError(
      `Failed to load mapping: ${e instanceof Error ? e.message : String(e)}`,
      'mapping_load',
    )
  }

  return finishPipeline({ rawText, mapping, audit, allReplacements, timings, t_start })
}

export async function runPipelineInline(
  text: string,
  mappingText: string,
): Promise<RedactionResult> {
  let mapping: PseudonymMap
  try {
    mapping = parseMappingText(mappingText, '<inline>')
  } catch (e) {
    throw new PipelineError(
      `Failed to parse mapping: ${e instanceof Error ? e.message : String(e)}`,
      'mapping_load',
    )
  }

  const t_start = Date.now()
  const audit: AuditEntry[] = []
  audit.push({
    timestamp: now(),
    action: 'ingest',
    content_hash: contentHash(text),
    details: { ocr_used: false, source_kind: 'text', char_count: text.length },
  })

  const timings: RedactionResult['timings'] = {
    regex_ms: 0,
    mapping_ms: 0,
    total_ms: 0,
  }

  return finishPipeline({
    rawText: text,
    mapping,
    audit,
    allReplacements: [],
    timings,
    t_start,
  })
}

// ---------------------------------------------------------------------------
// Shared finish: regex → mapping → audit. Used by both entry points.
// ---------------------------------------------------------------------------

interface FinishArgs {
  rawText: string
  mapping: PseudonymMap
  audit: AuditEntry[]
  allReplacements: Replacement[]
  timings: RedactionResult['timings']
  t_start: number
}

async function finishPipeline(args: FinishArgs): Promise<RedactionResult> {
  const { rawText, mapping, audit, allReplacements, timings, t_start } = args

  // Stage 2: Regex pass
  const t_regex = Date.now()
  const { rewritten: regexRedacted, replacements: regexReplacements } = applyRegexPass(rawText)
  timings.regex_ms = Date.now() - t_regex
  allReplacements.push(...regexReplacements)

  // Stage 3: Mapping pass (literalReplace, longest-key-first)
  const t_mapping = Date.now()
  const { output, replacements: mappingReplacements } =
    await replaceWithMapping({ mapping, text: regexRedacted })
  timings.mapping_ms = Date.now() - t_mapping
  allReplacements.push(...mappingReplacements)

  audit.push({
    timestamp: now(),
    action: 'redact',
    content_hash: contentHash(output),
    details: {
      regex_replacements: regexReplacements.length,
      mapping_replacements: mappingReplacements.length,
    },
  })
  void audit // accumulator; not surfaced through RedactionResult yet

  timings.total_ms = Date.now() - t_start

  return {
    output,
    replacements: allReplacements,
    timings,
  }
}
