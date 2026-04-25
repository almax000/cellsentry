/**
 * Counter-based pseudonym generator (per AD5 revised).
 *
 * Auto-assignment: 1 → 患者A, 2 → 患者B, ..., 27 → 患者AA, 28 → 患者AB, ...
 * Counter persisted in YAML frontmatter `next_pseudonym_index: N`.
 *
 * Manual override always wins — if user sets `pseudonym: 老张`, builder records
 * that exact string and still increments the counter so future auto-assignments
 * don't reuse the index.
 *
 * Real implementation in W3 Step 3.2.
 */

import type { PatientEntry, PseudonymMap } from '../types'

/** base26 encoding: 0 → 'A', 25 → 'Z', 26 → 'AA', 27 → 'AB', ... */
export function base26(_index: number): string {
  throw new Error('TODO: W3 Step 3.2 — base26 encoder not implemented')
}

/**
 * Assigns next auto-pseudonym for a new patient given the current counter.
 * Returns the new pseudonym AND the next counter value (caller persists both).
 */
export function nextPseudonym(_currentIndex: number): { pseudonym: string; nextIndex: number } {
  throw new Error('TODO: W3 Step 3.2 — counter assignment not implemented')
}

/**
 * Adds a patient to the mapping. If `patient.pseudonym` is empty, auto-assigns
 * via counter; otherwise records the manual value but still increments counter.
 */
export function addPatient(_map: PseudonymMap, _patient: Omit<PatientEntry, 'pseudonym'> & { pseudonym?: string }): PseudonymMap {
  throw new Error('TODO: W3 Step 3.2 — patient append not implemented')
}
