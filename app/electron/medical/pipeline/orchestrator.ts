/**
 * Pipeline orchestrator (W3 Step 3.7 / deferred from W3 closure).
 *
 * Glues every engine stage in plan v3 order:
 *   1. Ingest          — OCR (image/PDF) or pass-through (text)
 *   2. Regex pass      — CN ID + mobile + email + 病历号/医保号/就诊号 (findRegexPii)
 *   3. Collision scan  — BLOCK if unresolved overlaps (`张三` / `张三丰`)
 *   4. Mapping pass    — jieba whole-token + English word-boundary
 *   5. Date handler    — per patient.date_mode (stub until W4 Step 4.3)
 *   6. Safety-net      — flag missed names; optional (graceful skip if unavailable)
 *   7. Audit log       — accumulate AuditEntry per stage transition
 *
 * The orchestrator never silently drops PII — if a stage fails, it surfaces
 * the failure to UI and blocks. Graceful degradation only on optional
 * safety-net (e.g. when `analyze_available: false` in the Python server status).
 *
 * Span semantics in the returned RedactionResult:
 *   For W3 step 3.7 we track replacements per-stage with spans relative to
 *   the INPUT of that stage. The UI diff viewer (W4 Step 4.1) re-anchors
 *   them to the original-vs-final diff. Storing native per-stage spans
 *   keeps each engine simple and avoids span-shift bookkeeping that would
 *   propagate bugs.
 */

import { createHash } from 'crypto'

import { loadMapping } from '../mapping/parser'
import { scanForCollisions } from '../mapping/collisionScan'
import { replaceWithMapping } from '../mapping/jiebaEngine'
import { applyMasking, findRegexPii } from '../regex/patterns'
import { runSafetyNet } from './safetyNet'
import type {
  AuditEntry,
  CollisionWarning,
  PipelineRequest,
  PseudonymMap,
  RedactionResult,
  Replacement,
  SafetyNetFlag,
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
  if (src.kind === 'pdf') {
    // Try digital PDF fallback first; fall back to OCR if no text layer.
    const { tryDigitalPdf } = await import('../ocr/digitalPdfFallback')
    const digital = await tryDigitalPdf(src.path).catch(() => null)
    if (digital !== null) {
      return { text: digital.text, ocrUsed: false }
    }
  }
  // image / scanned PDF → real OCR via the unified Python server.
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
      | 'ingest' | 'mapping_load' | 'regex' | 'collision' | 'mapping_replace'
      | 'date_handler' | 'safety_net' | 'ocr_failed',
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
// Main entry point
// ---------------------------------------------------------------------------

export async function runPipeline(request: PipelineRequest): Promise<RedactionResult> {
  const t_start = Date.now()
  const audit: AuditEntry[] = []
  const allReplacements: Replacement[] = []
  let collisions: CollisionWarning[] = []
  let pendingFlags: SafetyNetFlag[] = []

  const timings: RedactionResult['timings'] = {
    regex_ms: 0,
    mapping_ms: 0,
    total_ms: 0,
  }

  // ── Stage 1: Ingest ───────────────────────────────────────────────────
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

  // ── Stage 1.5: Load mapping ───────────────────────────────────────────
  let mapping: PseudonymMap
  try {
    mapping = await loadMapping(request.mapping_path)
  } catch (e) {
    throw new PipelineError(
      `Failed to load mapping: ${e instanceof Error ? e.message : String(e)}`,
      'mapping_load',
    )
  }

  // ── Stage 2: Regex pass ───────────────────────────────────────────────
  const t_regex = Date.now()
  const { rewritten: regexRedacted, replacements: regexReplacements } = applyRegexPass(rawText)
  timings.regex_ms = Date.now() - t_regex
  allReplacements.push(...regexReplacements)

  // ── Stage 3: Collision pre-scan ───────────────────────────────────────
  // Run on the ORIGINAL raw text (before regex rewrites). Mapping keys are
  // names — the regex pass only touches IDs/numbers, so collision results
  // are the same either way; using raw text is simpler to reason about.
  collisions = scanForCollisions({ mapping, chunks: [rawText] })
  if (collisions.length > 0) {
    audit.push({
      timestamp: now(),
      action: 'collision_warning',
      content_hash: contentHash(rawText),
      details: { collision_count: collisions.length },
    })
    timings.total_ms = Date.now() - t_start
    // Block: return early with collisions populated. UI surfaces the panel
    // (per `_design/v2/screen-2-collision-warning.md`).
    return {
      output: rawText,
      replacements: [],
      pending_flags: [],
      collisions,
      timings,
    }
  }

  // ── Stage 4: Mapping pass (jieba whole-token + ASCII word-boundary) ───
  const t_mapping = Date.now()
  const { output: mappingRedacted, replacements: mappingReplacements } =
    await replaceWithMapping({ mapping, text: regexRedacted })
  timings.mapping_ms = Date.now() - t_mapping
  allReplacements.push(...mappingReplacements)

  audit.push({
    timestamp: now(),
    action: 'redact',
    content_hash: contentHash(mappingRedacted),
    details: {
      regex_replacements: regexReplacements.length,
      mapping_replacements: mappingReplacements.length,
    },
  })

  // ── Stage 5: Date handler (per AD4 / W4 Step 4.3) ─────────────────────
  // Applies the mode of the FIRST patient in the mapping; for multi-patient
  // documents the orchestrator picks the dominant mode. (Future iteration:
  // partition the doc per patient; doable once we have per-section attribution
  // — W6+ work.)
  let dateHandled = mappingRedacted
  let dateReplacements: Replacement[] = []
  if (mapping.patients.length > 0 && mapping.patients[0].date_mode !== 'preserve') {
    const { applyDateMode } = await import('./dateHandler')
    const dateResult = applyDateMode({
      text: mappingRedacted,
      mode: mapping.patients[0].date_mode,
      offset_days: mapping.patients[0].date_offset_days,
    })
    dateHandled = dateResult.output
    dateReplacements = dateResult.replacements
    allReplacements.push(...dateReplacements)
  }
  void dateReplacements // referenced through allReplacements

  // ── Stage 6: Safety-net (optional, graceful skip) ─────────────────────
  // Preview-only mode skips the safety-net since it's slow (~3-8 s) and the
  // user is just inspecting; full redact run does it.
  if (!request.preview_only) {
    const knownPseudonyms: string[] = []
    for (const p of mapping.patients) {
      knownPseudonyms.push(p.pseudonym)
      for (const ae of p.additional_entities) knownPseudonyms.push(ae.pseudonym)
    }
    const t_safety = Date.now()
    const safetyOutcome = await runSafetyNet({
      redacted_text: dateHandled,
      known_pseudonyms: knownPseudonyms,
    })
    timings.safety_net_ms = Date.now() - t_safety

    if (safetyOutcome.kind === 'flags') {
      pendingFlags = safetyOutcome.flags
      if (pendingFlags.length > 0) {
        audit.push({
          timestamp: now(),
          action: 'safety_net_flag',
          content_hash: contentHash(dateHandled),
          details: { flag_count: pendingFlags.length },
        })
      }
    }
    // 'unreadable' or 'unavailable' → skip (UI shows degraded banner per
    // screen-4 spec). Don't fail the pipeline; user can finalize with a
    // manual review.
  }

  timings.total_ms = Date.now() - t_start

  return {
    output: dateHandled,
    replacements: allReplacements,
    pending_flags: pendingFlags,
    collisions: [],
    timings,
  }
}

// ---------------------------------------------------------------------------
// Convenience export — read mapping path + run pipeline against text
// ---------------------------------------------------------------------------

export async function runPipelineFromText(
  text: string,
  mappingPath: string,
  preview = false,
): Promise<RedactionResult> {
  return runPipeline({
    source: { kind: 'text', content: text },
    mapping_path: mappingPath,
    preview_only: preview,
  })
}

// ---------------------------------------------------------------------------
// Inline-mapping entry — for the renderer-side flow that holds mapping text
// in component state and doesn't want to round-trip through the file system.
// Same pipeline as runPipeline but accepts a parsed PseudonymMap object directly.
// ---------------------------------------------------------------------------

import { parseMappingText } from '../mapping/parser'

export async function runPipelineInline(
  text: string,
  mappingText: string,
  preview = false,
): Promise<RedactionResult> {
  // Parse + validate mapping (throws PipelineError-equivalent on bad YAML).
  let mapping: PseudonymMap
  try {
    mapping = parseMappingText(mappingText, '<inline>')
  } catch (e) {
    throw new PipelineError(
      `Failed to parse mapping: ${e instanceof Error ? e.message : String(e)}`,
      'mapping_load',
    )
  }

  return runPipelineWithMapping(text, mapping, preview)
}

/** Lower-level entry — used by both inline + path-based callers. */
async function runPipelineWithMapping(
  text: string,
  mapping: PseudonymMap,
  preview: boolean,
): Promise<RedactionResult> {
  const t_start = Date.now()
  const audit: AuditEntry[] = []
  const allReplacements: Replacement[] = []
  let pendingFlags: SafetyNetFlag[] = []

  const timings: RedactionResult['timings'] = {
    regex_ms: 0,
    mapping_ms: 0,
    total_ms: 0,
  }

  audit.push({
    timestamp: now(),
    action: 'ingest',
    content_hash: contentHash(text),
    details: { ocr_used: false, source_kind: 'text', char_count: text.length },
  })

  // Stage 2: regex
  const t_regex = Date.now()
  const { rewritten: regexRedacted, replacements: regexReplacements } = applyRegexPass(text)
  timings.regex_ms = Date.now() - t_regex
  allReplacements.push(...regexReplacements)

  // Stage 3: collision pre-scan
  const collisions = scanForCollisions({ mapping, chunks: [text] })
  if (collisions.length > 0) {
    audit.push({ timestamp: now(), action: 'collision_warning', details: { collision_count: collisions.length } })
    timings.total_ms = Date.now() - t_start
    return { output: text, replacements: [], pending_flags: [], collisions, timings }
  }

  // Stage 4: mapping
  const t_mapping = Date.now()
  const { output: mappingRedacted, replacements: mappingReplacements } =
    await replaceWithMapping({ mapping, text: regexRedacted })
  timings.mapping_ms = Date.now() - t_mapping
  allReplacements.push(...mappingReplacements)

  // Stage 5: date handler
  let dateHandled = mappingRedacted
  if (mapping.patients.length > 0 && mapping.patients[0].date_mode !== 'preserve') {
    const { applyDateMode } = await import('./dateHandler')
    const dateResult = applyDateMode({
      text: mappingRedacted,
      mode: mapping.patients[0].date_mode,
      offset_days: mapping.patients[0].date_offset_days,
    })
    dateHandled = dateResult.output
    allReplacements.push(...dateResult.replacements)
  }

  // Stage 6: safety-net (skipped in preview)
  if (!preview) {
    const knownPseudonyms: string[] = []
    for (const p of mapping.patients) {
      knownPseudonyms.push(p.pseudonym)
      for (const ae of p.additional_entities) knownPseudonyms.push(ae.pseudonym)
    }
    const t_safety = Date.now()
    const safetyOutcome = await runSafetyNet({
      redacted_text: dateHandled,
      known_pseudonyms: knownPseudonyms,
    })
    timings.safety_net_ms = Date.now() - t_safety
    if (safetyOutcome.kind === 'flags') {
      pendingFlags = safetyOutcome.flags
    }
  }

  audit.push({
    timestamp: now(),
    action: 'redact',
    content_hash: contentHash(dateHandled),
    details: { replacement_count: allReplacements.length },
  })
  void audit

  timings.total_ms = Date.now() - t_start
  return {
    output: dateHandled,
    replacements: allReplacements,
    pending_flags: pendingFlags,
    collisions: [],
    timings,
  }
}
