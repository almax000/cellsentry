/**
 * Counter-based pseudonym generator (W3 Step 3.2 / AD5 revised).
 *
 * Why counter (not deterministic hash):
 *   v1 plan proposed `sha256(patient_id)[0:4] % 676` (4 hex × 26 codepoints)
 *   which has a ~52% birthday-paradox collision rate at just 100 patients.
 *   Even a 4-letter (26^4 = 457k) hash drops to <1% only up to ~200.
 *   A counter is simpler and correct for any plausible patient count.
 *
 * Encoding:
 *   index 0  → "A"
 *   index 25 → "Z"
 *   index 26 → "AA"   (not "BA" — Excel column naming)
 *   index 51 → "AZ"
 *   index 52 → "BA"
 *   index 701 → "ZZ"
 *   index 702 → "AAA"
 *
 * Pseudonym = "患者" + base26(index). User can override via manual `pseudonym`
 * field; manual override always wins, but we still increment the counter so
 * future auto-assignments don't reuse the index.
 */

import type { PatientEntry, PseudonymMap } from '../types'

/** Excel-column-style base-26 encoding. 0 → "A", 25 → "Z", 26 → "AA", … */
export function base26(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`base26 expects non-negative integer, got ${index}`)
  }
  let s = ''
  let n = index
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** Computes the next auto-pseudonym for a given counter value. */
export function nextPseudonym(currentIndex: number): { pseudonym: string; nextIndex: number } {
  return {
    pseudonym: `患者${base26(currentIndex)}`,
    nextIndex: currentIndex + 1,
  }
}

export interface AddPatientInput {
  patient_id: string
  real_name: string
  aliases?: string[]
  /** If omitted, an auto-pseudonym is assigned via the counter. */
  pseudonym?: string
  additional_entities?: PatientEntry['additional_entities']
}

/**
 * Adds a patient to the mapping. Manual `pseudonym` always wins; counter
 * increments either way so future auto-assignments don't reuse the index.
 *
 * Returns a NEW map (immutable update; original `map` not modified) so the
 * orchestrator can stage edits and confirm with one writer.ts call.
 */
export function addPatient(map: PseudonymMap, input: AddPatientInput): PseudonymMap {
  const isAuto = !input.pseudonym
  const auto = isAuto ? nextPseudonym(map.next_pseudonym_index) : null
  const pseudonym = input.pseudonym ?? auto!.pseudonym
  const newIndex = auto?.nextIndex ?? map.next_pseudonym_index + 1 // increment even for manual

  const entry: PatientEntry = {
    patient_id: input.patient_id,
    real_name: input.real_name,
    aliases: input.aliases ?? [],
    pseudonym,
    additional_entities: input.additional_entities ?? [],
  }

  return {
    ...map,
    next_pseudonym_index: newIndex,
    patients: [...map.patients, entry],
  }
}
