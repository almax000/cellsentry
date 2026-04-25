/**
 * Jieba-based whole-token replacement engine.
 *
 * Pipeline (W3 Step 3.4):
 *   1. Inject mapping keys (real_name + aliases) into jieba user dict, weight = 99999.
 *   2. Segment input.
 *   3. For each token matching a mapping key, replace with the patient's pseudonym.
 *   4. English names use whole-word boundary regex `(?<![a-zA-Z0-9])NAME(?![a-zA-Z0-9])`
 *      because Latin word boundary IS reliable (unlike CJK).
 *   5. Return { output, replacements }.
 *
 * Windows fallback: nodejieba native compile → jieba-wasm via USE_JIEBA_WASM=1.
 *
 * IMPORTANT: callers must run collisionScan first. If collisions exist and are
 * unresolved, orchestrator blocks BEFORE jiebaEngine runs.
 */

import type { PseudonymMap, Replacement } from '../types'

export interface JiebaReplaceInput {
  mapping: PseudonymMap
  text: string
}

export interface JiebaReplaceResult {
  output: string
  replacements: Replacement[]
}

export function replaceWithMapping(_input: JiebaReplaceInput): JiebaReplaceResult {
  throw new Error('TODO: W3 Step 3.4 — nodejieba not installed yet')
}
