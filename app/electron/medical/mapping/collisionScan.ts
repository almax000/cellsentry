/**
 * Pre-pipeline collision scan (per AD3).
 *
 * Catches the `张三` / `张三丰` failure mode: mapping has `张三 → 患者A`, input
 * contains `张三丰` (legitimate longer name not in mapping). Without this scan,
 * jieba could whole-token segment `张三` even with weight 99999 — replacing
 * `张三` inside `张三丰` gives garbage `患者A丰`.
 *
 * Algorithm (W3 Step 3.3):
 *   1. Segment input with jieba (no user-dict yet).
 *   2. Build set of mapping keys (real_name + aliases for every patient).
 *   3. For each segmented token: if token is NOT a mapping key, but DOES contain
 *      a mapping key as a substring (CJK char-aware), flag.
 *   4. Return list of CollisionWarning. Pipeline orchestrator BLOCKS on non-empty.
 *
 * Stub here defines surface only.
 */

import type { CollisionWarning, PseudonymMap } from '../types'

export interface CollisionScanInput {
  mapping: PseudonymMap
  /** Input text chunks (one per OCR page or text block). */
  chunks: string[]
}

export function scanForCollisions(_input: CollisionScanInput): CollisionWarning[] {
  throw new Error('TODO: W3 Step 3.3 — collision scan not implemented')
}
