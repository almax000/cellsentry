/**
 * Date transformation per patient's `date_mode` (W4 Step 4.3 / AD4).
 *
 * Modes:
 *   - preserve (default): pass-through. Medical temporal context matters;
 *     CellSentry v2 explicitly is NOT HIPAA-compliant.
 *   - offset_days: shift every date by `offset_days`, stable per patient
 *     so timeline relations hold. Original format preserved (CN→CN, EN→EN, ISO→ISO).
 *   - bucket_month: round to the first of the month (YYYY-MM-01 in same format).
 *
 * Vague dates (去年冬天 / "last winter") are returned by chrono with
 * `isCertain('day')=false`. Plan v3 says skip those — we leave them
 * untouched and don't emit a replacement entry.
 *
 * Format-preservation strategy: chrono returns the matched substring (`text`
 * field). We detect format from the substring's shape and reformat the
 * shifted date into the same shape. Dates not matching a known format fall
 * back to ISO (YYYY-MM-DD).
 */

import * as chrono from 'chrono-node'

import type { DateMode, Replacement } from '../types'

export interface DateHandlerInput {
  text: string
  mode: DateMode
  /** Days to offset when mode === 'offset_days'. Defaults to 0. */
  offset_days?: number
}

export interface DateHandlerResult {
  output: string
  replacements: Replacement[]
}

interface ParsedDate {
  text: string
  start: number
  end: number
  date: Date
  certain: boolean
  format: DateFormat
}

type DateFormat =
  | 'cn_long'        // 2025年3月15日
  | 'iso'            // 2025-03-15
  | 'en_long'        // March 15, 2025
  | 'en_slash'       // 3/15/25 or 3/15/2025
  | 'cn_short'       // 2025年3月 (month-only) — bucket_month no-op
  | 'unknown'        // fallback to ISO

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function detectFormat(matchText: string): DateFormat {
  if (/年.*月.*日/.test(matchText)) return 'cn_long'
  if (/年.*月(?!.*日)/.test(matchText)) return 'cn_short'
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(matchText.trim())) return 'iso'
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(matchText.trim())) return 'en_slash'
  if (/^[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}$/.test(matchText.trim())) return 'en_long'
  return 'unknown'
}

/**
 * Heuristic vague-phrase filter. chrono.parse('last week') resolves to a
 * concrete date even though the matched text is purely relative — and
 * `isCertain('day')` returns true because chrono computed a specific day.
 * For medical-record purposes, "last week" / "去年冬天" / "yesterday" should
 * stay as-is; shifting them to a concrete date is misleading.
 *
 * Signal: a matched substring with NO digits AND NO month-name word is a
 * relative phrase that we should NOT shift. Anything containing a year
 * number, day number, or "March"/"3月" etc. is a concrete date.
 */
function isVagueMatch(matchText: string): boolean {
  if (/\d/.test(matchText)) return false // contains digits → concrete
  if (/(?:January|February|March|April|May|June|July|August|September|October|November|December)/i.test(matchText)) {
    return false
  }
  if (/[一二三四五六七八九十]+月/.test(matchText)) return false // CN month with digit name
  return true // no digits, no month name → vague
}

function parseAll(text: string): ParsedDate[] {
  const results: ParsedDate[] = []

  const en = chrono.parse(text)
  const zh = chrono.zh.hans.parse(text)

  for (const r of [...en, ...zh]) {
    const certain = r.start.isCertain('day') && r.start.isCertain('month') && r.start.isCertain('year')
    if (!certain) continue
    // Skip relative phrases like "last week" that chrono resolved to a
    // concrete date but where the matched text carries no concrete signal.
    if (isVagueMatch(r.text)) continue
    results.push({
      text: r.text,
      start: r.index,
      end: r.index + r.text.length,
      date: r.start.date(),
      certain,
      format: detectFormat(r.text),
    })
  }

  // De-dupe by span (chrono.parse + zh.hans.parse may both match an ISO).
  // Keep longest match starting at each position.
  results.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return b.end - a.end
  })
  const out: ParsedDate[] = []
  let cursor = 0
  for (const r of results) {
    if (r.start >= cursor) {
      out.push(r)
      cursor = r.end
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Format-preserving rewrite
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatDate(date: Date, fmt: DateFormat, original?: string): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  switch (fmt) {
    case 'cn_long':
      return `${y}年${m}月${d}日`
    case 'cn_short':
      return `${y}年${m}月`
    case 'iso':
      return `${y}-${pad2(m)}-${pad2(d)}`
    case 'en_slash': {
      // Detect 2- vs 4-digit year from original.
      const has4digit = original ? /\/\d{4}$/.test(original.trim()) : true
      const yy = has4digit ? `${y}` : `${y % 100}`.padStart(2, '0')
      return `${m}/${d}/${yy}`
    }
    case 'en_long':
      return `${MONTH_NAMES[date.getMonth()]} ${d}, ${y}`
    case 'unknown':
    default:
      return `${y}-${pad2(m)}-${pad2(d)}`
  }
}

function applyMode(parsed: ParsedDate, mode: DateMode, offsetDays: number): Date | null {
  switch (mode) {
    case 'preserve':
      return null // no change
    case 'offset_days': {
      const d = new Date(parsed.date)
      d.setDate(d.getDate() + offsetDays)
      return d
    }
    case 'bucket_month': {
      const d = new Date(parsed.date.getFullYear(), parsed.date.getMonth(), 1)
      return d
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyDateMode(input: DateHandlerInput): DateHandlerResult {
  if (input.mode === 'preserve') {
    return { output: input.text, replacements: [] }
  }

  const offsetDays = input.offset_days ?? 0
  const parsed = parseAll(input.text)

  if (parsed.length === 0) {
    return { output: input.text, replacements: [] }
  }

  // Right-to-left rewrite so spans of earlier matches stay valid.
  const sorted = [...parsed].sort((a, b) => b.start - a.start)
  let output = input.text
  const replacements: Replacement[] = []

  for (const p of sorted) {
    const newDate = applyMode(p, input.mode, offsetDays)
    if (newDate === null) continue

    // bucket_month no-op when date is already on the 1st (avoid noisy
    // replacement records).
    if (input.mode === 'bucket_month' && p.date.getDate() === 1) {
      continue
    }

    const newText = formatDate(newDate, p.format, p.text)
    if (newText === p.text) continue // no-op shift (e.g. offset_days=0)

    output = output.slice(0, p.start) + newText + output.slice(p.end)
    replacements.push({
      original: p.text,
      pseudonym: newText,
      span: [p.start, p.start + newText.length],
      reason: 'date',
    })
  }

  // Return left-to-right for UI.
  replacements.reverse()
  return { output, replacements }
}
