/**
 * Date transformation per patient's `date_mode` (AD4).
 *
 * Mode A (default, 'preserve'): leave dates unchanged. Medical temporal context
 *   matters; CellSentry v2 explicitly is NOT HIPAA-compliant.
 * Mode B ('offset_days'): shift every date by patient.date_offset_days, stable
 *   within one patient so timeline relations hold.
 * Mode C ('bucket_month'): YYYY-MM-DD → YYYY-MM-01.
 *
 * Real implementation in W4 (orchestrator wires it).
 */

import type { DateMode, Replacement } from '../types'

export interface DateHandlerInput {
  text: string
  mode: DateMode
  offset_days?: number
}

export interface DateHandlerResult {
  output: string
  replacements: Replacement[]
}

export function applyDateMode(_input: DateHandlerInput): DateHandlerResult {
  throw new Error('TODO: W4 — date transformation not implemented')
}
