/**
 * Pipeline orchestrator (W4 milestone).
 *
 * Sequence:
 *   1. Ingest          — OCR (image/PDF) or pass-through (text).
 *   2. Collision scan  — BLOCK if unresolved overlaps (`张三` / `张三丰`).
 *   3. Regex pass      — CN ID + mobile + email + 病历号/医保号/就诊号.
 *   4. Mapping pass    — jieba whole-token + English word-boundary.
 *   5. Date handler    — per patient.date_mode.
 *   6. Safety-net      — flag missed names; UI gates final export.
 *   7. Audit log       — append entry for every stage transition.
 *
 * The orchestrator never silently drops PII — if a stage fails, it surfaces
 * the failure to UI and blocks. Graceful degradation only on optional safety-net
 * (e.g. when `analyze_available: false` in the Python server status).
 */

import type { PipelineRequest, RedactionResult } from '../types'

export async function runPipeline(_request: PipelineRequest): Promise<RedactionResult> {
  throw new Error('TODO: W4 — orchestrator not yet wired')
}
