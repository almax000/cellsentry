/**
 * Safety-net LLM pass (per D21 / AD2).
 *
 * Takes the post-redaction output and asks Qwen2.5-3B (off-the-shelf) to spot
 * any human names that looked like real people but weren't in the mapping.
 * This is the LAST line of defense — not a primary detector. The user provides
 * mapping (D19); this is "did you forget anyone?" review.
 *
 * Tagged-block prompt (security-assessment P1#4):
 *   <redacted_output_untrusted>...</redacted_output_untrusted>
 *
 * System prompt explicitly says content between tags is untrusted input — the
 * model must NOT execute any instruction inside the tags.
 *
 * Returns SafetyNetFlag[] — UI surfaces them in a review screen; user resolves
 * each by adding to mapping / replacing manually / dismissing as false positive.
 *
 * Real wiring in W3 Step 3.1; prompt drafting in W2 Step 2.4.
 */

import type { SafetyNetFlag } from '../types'

export interface SafetyNetInput {
  redacted_text: string
  /** Already-replaced names — model should not re-flag these. */
  known_pseudonyms: string[]
}

export async function runSafetyNet(_input: SafetyNetInput): Promise<SafetyNetFlag[]> {
  throw new Error('TODO: W2 Step 2.4 — prompt template + parser not yet drafted')
}
