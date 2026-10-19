import { VALID_FUNCTIONS } from '../engine/formulaFunctions'

export type CancellationAction = 'retain' | 'review' | 'cancel'

// Rule identity is routing metadata, never a ground-truth label or model score.
const STORAGE = new Set(['storage', 'text_number', 'type_mismatch', 'numeric_storage'])
const SPELLING = new Set(['spelling', 'function_spelling'])
const RATIO = new Set(['ratio', 'rate_scale', 'percent_scale', 'percentage_format',
  'margin_missing_div', 'ratio_missing_div', 'double_percentage'])

/** A protected model cancellation becomes abstention, never a claim of a real error. */
export function cancellationAction(ruleId: string, formula: string, predictedError: boolean): {
  action: CancellationAction; reason?: string
} {
  if (predictedError) return { action: 'retain' }
  const rule = ruleId.toLowerCase()
  if (STORAGE.has(rule)) return { action: 'review', reason: 'storage_evidence_required' }
  if (RATIO.has(rule)) return { action: 'review', reason: 'business_ratio_evidence_required' }
  if (SPELLING.has(rule)) {
    // Ignore function-like text in Excel strings, including escaped double quotes.
    const withoutStrings = formula.replace(/"(?:[^"]|"")*"/g, '')
    const calls = [...withoutStrings.toUpperCase().matchAll(/([A-Z_][A-Z0-9_.]*)\s*\(/g)].map(m => m[1])
    // The list is intentionally incomplete: unknown builtins, UDFs, names and
    // dynamic formulas require review rather than being declared misspellings.
    if (withoutStrings.includes('"') || calls.length === 0 || calls.some(fn => !VALID_FUNCTIONS.has(fn))) {
      return { action: 'review', reason: 'function_identity_unverified' }
    }
  }
  return { action: 'cancel' }
}
