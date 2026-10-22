/** What makes two spellings "the same value", shared by codes, propagation and the leftover check. */
import type { PiiCategory } from './types'
import { compactNumber, compactPhone, compactText, escapeRegExp, looseNumberPattern, looseTextPattern, normalizeText, NUMBER_SEPARATORS } from './text'

export const NUMERIC: ReadonlySet<PiiCategory> = new Set(['phone', 'id_number', 'social_security', 'bank_card', 'record_number'])

/**
 * Numbers that are often made of a date (编号 20250815, 住院号 2025081501).
 * They are found in any grouping OCR produces (3746 5821, TJ-2025-0001), but a
 * spot that reads as a date (2025-08-15, 2025.8.15 08:30) is never taken for
 * one, so ordinary dates stay in the text.
 */
export const EXACT_ONLY: ReadonlySet<PiiCategory> = new Set(['record_number', 'social_security'])

/** Shorter numbers are matched only as written: with separators they would turn up everywhere. */
export const MIN_LOOSE_NUMBER = 7

/**
 * 2025-08-15, 2025.8.15, 2025 08 15 (and a time after a space): a year, then
 * month and day in short groups. Anything with a letter (TJ-2025-08-15) or a
 * fourth group joined like the others (2025-08-15-03) is a number, not a date.
 */
export function readsAsDate(written: string): boolean {
  if (/[A-Za-z]/.test(written)) return false
  const parts = written.trim().split(/([^0-9]+)/)
  const groups = parts.filter((_, index) => index % 2 === 0)
  const gaps = parts.filter((_, index) => index % 2 === 1)
  if (groups.length < 3 || !/^(?:19|20)\d{2}$/.test(groups[0]) || groups.slice(1, 3).some((group) => group.length > 2)) return false
  if (groups.length > 3 && !/\s/.test(gaps[2])) return false
  const month = Number(groups[1])
  const day = Number(groups[2])
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/** 20240115: a date written solid, as many sample and record lines start. */
export function readsAsSolidDate(written: string): boolean {
  return /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(written)
}

/**
 * The identity of a phone number: a mobile without +86, and a landline after +86 with the 0 its area code
 * drops there (+86-21-83134703 is 021-83134703). Area codes are 10, 2x or three digits from 3 up.
 */
function phoneKey(value: string): string {
  const digits = compactPhone(value)
  const landline = /^(?:0086|86)((?:10|2\d|[3-9]\d{2})\d{7,8})$/.exec(digits)
  return landline ? `0${landline[1]}` : digits
}

/** The identity of a value: digits and letters for numbers (phones without +86), normalized text otherwise. */
export function valueKey(category: PiiCategory, value: string): string {
  if (category === 'phone') return phoneKey(value)
  if (category === 'email') return normalizeText(value).trim().toLowerCase()
  return NUMERIC.has(category) ? compactNumber(value) : compactText(value)
}

/** True when a number may be matched with separators between its characters (see EXACT_ONLY for the date guard). */
export function allowsSeparators(_category: PiiCategory, key: string): boolean {
  return key.length >= MIN_LOOSE_NUMBER
}

/**
 * An exact-only number as written: the same groups of characters with any
 * separator between them (3301 0619 9001 01, 3301-0619-9001-01), or no
 * separators at all. Separators are never allowed anywhere else, so
 * 编号 20250815 still leaves the date 2025-08-15 alone.
 */
function exactNumberPattern(value: string, key: string): string {
  const groups = normalizeText(value).split(/[^0-9A-Za-z]+/).filter(Boolean)
  const compact = escapeRegExp(key)
  if (groups.length <= 1) return compact
  return `(?:${groups.map(escapeRegExp).join(`[${NUMBER_SEPARATORS}]{1,3}`)}|${compact})`
}

/** Finds a value written with or without the spaces and dashes OCR and people add. Run it on normalized text. */
export function valuePattern(category: PiiCategory, value: string): RegExp | null {
  if (!NUMERIC.has(category)) {
    const core = looseTextPattern(value)
    return core ? new RegExp(core, 'gi') : null
  }
  const key = valueKey(category, value)
  if (key.length < 4) return null
  const core = allowsSeparators(category, key) ? looseNumberPattern(key) : exactNumberPattern(value, key)
  if (!core) return null
  const country = category === 'phone' ? '(?:(?:\\+|00)?86[ \\t-]{0,3})?' : ''
  return new RegExp(`(?<![0-9A-Za-z])${country}${core}(?![0-9A-Za-z])`, 'gi')
}

/**
 * A run of digits, letters and the separators between them. One line break is
 * bridged when a digit follows, since OCR and narrow columns split numbers.
 * Run it on normalized text.
 */
const NUMBER_RUN = new RegExp(`[0-9A-Za-z](?:[0-9A-Za-z+()${NUMBER_SEPARATORS}]|\\n(?=[0-9]))*`, 'g')

export interface NumberRun {
  start: number
  end: number
  /** Digits and letters of the run, upper-cased, separators removed. */
  compact: string
  /**
   * Where `key` occurs, with no digit glued right before or after it in the
   * text (letters are fine: TEL13912345678). With `whole`, the run must be
   * exactly `key`.
   */
  find(key: string, whole?: boolean, relaxed?: boolean): Array<{ start: number; end: number }>
}

/** Above this many hits in one run the run is reported once; a real record never gets close. */
const MAX_HITS_PER_RUN = 50

export function numberRuns(text: string): NumberRun[] {
  const runs: NumberRun[] = []
  // Glued to a digit in the text itself means part of a longer number; a separator in between does not
  // (6222 0000 1111 2223 100.00 is a card number and an amount).
  const digitAt = (index: number): boolean => index >= 0 && index < text.length && text[index] >= '0' && text[index] <= '9'
  NUMBER_RUN.lastIndex = 0
  for (const match of text.matchAll(NUMBER_RUN)) {
    const base = match.index ?? 0
    let compact = ''
    const position: number[] = []
    for (let i = 0; i < match[0].length; i++) {
      const char = match[0][i]
      if (/[0-9A-Za-z]/.test(char)) {
        compact += char.toUpperCase()
        position.push(base + i)
      }
    }
    runs.push({
      start: base,
      end: base + match[0].length,
      compact,
      find(key: string, whole = false, relaxed = false) {
        if (!key || key.length > compact.length) return []
        if (whole) return compact === key ? [{ start: position[0], end: position[position.length - 1] + 1 }] : []
        const spans: Array<{ start: number; end: number }> = []
        let from = compact.indexOf(key)
        while (from !== -1 && spans.length < MAX_HITS_PER_RUN) {
          const to = from + key.length
          if (relaxed || (!digitAt(position[from] - 1) && !digitAt(position[to - 1] + 1))) spans.push({ start: position[from], end: position[to - 1] + 1 })
          from = compact.indexOf(key, to)
        }
        return spans
      },
    })
  }
  return runs
}

/**
 * The spellings to look for inside number runs. A mobile number may carry a
 * country code (86…, 0086…); a landline may lose its leading 0 after +86 or
 * 0086, or be written as the local number alone (then only a whole run counts).
 */
export function runKeys(category: PiiCategory, key: string): Array<{ key: string; whole: boolean }> {
  const keys = [{ key, whole: false }]
  if (category !== 'phone') return keys
  if (/^1[3-9]\d{9}$/.test(key)) keys.push({ key: `86${key}`, whole: false }, { key: `0086${key}`, whole: false })
  if (/^0\d{9,11}$/.test(key)) {
    keys.push({ key: `86${key.slice(1)}`, whole: false }, { key: `0086${key.slice(1)}`, whole: false })
    // Area codes are 3 or 4 digits with the 0, local numbers 7 or 8: 010-12345678, 0571-8888123, 0571-88881234.
    if (key.length >= 11) keys.push({ key: key.slice(-8), whole: true })
    if (key.length <= 11) keys.push({ key: key.slice(-7), whole: true })
  }
  return keys
}

export interface ValueSpot {
  start: number
  end: number
  /** Only the local part of a landline, standing alone: likely the same number, but worth a look. */
  localOnly?: boolean
}

/**
 * Every spot where `value` occurs in normalized `text`. "My info",
 * propagation and the leftover check all look this way, so they never
 * disagree about what counts as the same value. Pass `runs` when looking for
 * many values in one text.
 */
export function findValue(text: string, category: PiiCategory, value: string, runs?: NumberRun[]): ValueSpot[] {
  const key = valueKey(category, value)
  const spots: ValueSpot[] = []
  const ownSpelling = normalizeText(value).trim()
  if (NUMERIC.has(category) && allowsSeparators(category, key)) {
    for (const run of runs ?? numberRuns(text)) {
      for (const variant of runKeys(category, key)) {
        for (const found of run.find(variant.key, variant.whole)) {
          // The value's own spelling always counts, even when it looks like a date.
          const written = text.slice(found.start, found.end)
          if (EXACT_ONLY.has(category) && written !== ownSpelling && readsAsDate(written)) continue
          spots.push({ ...withPlus(text, found), ...(variant.whole && variant.key !== key && { localOnly: true }) })
        }
      }
    }
    return spots
  }
  const regex = valuePattern(category, value)
  if (!regex) return spots
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0
    spots.push({ start, end: start + match[0].length })
  }
  return spots
}

/** Widen a span over a "+" right before it, so +8613912345678 is replaced whole. */
export function withPlus(text: string, span: { start: number; end: number }): { start: number; end: number } {
  return text[span.start - 1] === '+' ? { start: span.start - 1, end: span.end } : span
}
