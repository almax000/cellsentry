/** What makes two spellings "the same value", shared by codes, propagation and the leftover check. */
import type { PiiCategory } from './types'
import { compactAddress, compactNumber, compactPhone, compactText, escapeRegExp, looseNumberPattern, looseTextPattern, normalizeText, NUMBER_SEPARATORS } from './text'

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

/** A date and a time: two groups (20240115 0830) or twelve digits (202401160856). A number may hold a date (MZ20\n200507236). */
export function dateAndTime(written: string): boolean {
  const time = (hhmm: string): boolean => /^(?:[01]\d|2[0-3])[0-5]\d(?:[0-5]\d)?$/.test(hhmm)
  const parts = written.trim().split(/[ \t]+/)
  if (parts.length === 2) return readsAsSolidDate(parts[0]) && time(parts[1])
  return parts.length === 1 && (parts[0].length === 12 || parts[0].length === 14) && readsAsSolidDate(parts[0].slice(0, 8)) && time(parts[0].slice(8))
}

/**
 * What follows the year of a date: 年, a month and a day, or a month of two digits, also with OCR's gaps inside them
 * (年曾行, /02/22, -2-4, .01-, -12-0  8). A number with a suffix is no date (样本号 2019-2).
 */
const YEAR_OF_DATE = /^[ \t]*(?:年|[-/.][ \t]*(?:\d(?:[ \t]{0,2}\d)?[ \t]*[-/.][ \t]*\d|(?:0[ \t]{0,2}[1-9]|1[ \t]{0,2}[0-2])(?![ \t]*\d)))/

/** Whether four digits from `start` to `end` are the year of a date: month and day after them, or a date's label before (参保日期：2024). */
function yearOfDate(text: string, start: number, end: number): boolean {
  return /^(?:19|20)\d{2}$/.test(text.slice(start, end))
    && (YEAR_OF_DATE.test(text.slice(end, end + 12)) || /(?:日期|时间|年份|年度)[ \t]*:?[ \t]*$/.test(text.slice(Math.max(0, start - 8), start)))
}

/** 20240115: a date written solid, as many sample and record lines start. */
export function readsAsSolidDate(written: string): boolean {
  return /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(written)
}

/** 2024-01, 202401, 2024.01, maybe with the dash a line break left after it: the start of a date more than of a number. */
export function readsAsYearMonth(written: string): boolean {
  return /^(?:19|20)\d{2}[-/.]?(?:0[1-9]|1[0-2])-?$/.test(written.trim())
}

/** A year and month, or a date, with the dash a line break left after it (2024-01-, 202401-, 20240115-): the head of a cut number. */
export function readsAsDateHead(written: string): boolean {
  const bare = written.trim()
  if (!bare.endsWith('-')) return false
  return readsAsYearMonth(bare) || readsAsSolidDate(bare.slice(0, -1)) || readsAsDate(bare.slice(0, -1))
}

/**
 * Whether a year and month from `start` to `end` belongs to a date or a period: its day after the same separator
 * (2024-01-15; a solid 201203 goes on as a number: 201203-12床), another year and month on the other side of a dash
 * (202401-202403, 202312-202401) or 至今 (2024.01-至今), 月 after it, or a date's label before.
 */
function yearMonthOfDate(text: string, start: number, end: number): boolean {
  const written = /^(?:19|20)\d{2}([-/.]?)(?:0[1-9]|1[0-2])$/.exec(text.slice(start, end))
  if (!written) return false
  const after = text.slice(end, end + 12)
  return (written[1] !== '' && after.startsWith(written[1]) && /^.[ \t]*(?:0?[1-9]|[12]\d|3[01])(?!\d)/.test(after))
    || /^(?:[ \t]*[-~至到][ \t]*\n?[ \t]*(?:19|20)\d{2}[-/.]?(?:0[1-9]|1[0-2])(?!\d)|[ \t]*-?[ \t]*\n?[ \t]*(?:至今|迄今|以来|今|现在|目前)|[ \t]*月)/.test(after)
    || /(?:(?:19|20)\d{2}[-/.]?(?:0[1-9]|1[0-2])[ \t]*[-~至到]|日期|时间|期间|年月|月份|年度)[ \t]*:?[ \t]*$/.test(text.slice(Math.max(0, start - 12), start))
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

/** A house, building or room number: what makes the start of an address a home, not just a road. */
const HOUSE_NUMBER = /\d[ \t]*(?:号|栋|幢|楼|单元|室)/
/** Words that end the name of an estate or a block of flats. */
export const ESTATE_WORD = '(?:小区|花园|新村|家园|嘉园|公寓|宿舍|大院|家属院|大厦|山庄|新城|华庭|华府|苑)'
/**
 * What may follow a street address in a copy of the same home: no more words, its estate, building or room, or a
 * word for a spot at the home (…12号家中摔倒, …88号附近, …号楼下).
 */
const MORE_OF_A_HOME = new RegExp(`^[ \\t]*(?:$|[^\u4e00-\u9fff]|[\u4e00-\u9fff]{1,10}?(?:${ESTATE_WORD}|\\d)|的?(?:家中|家里|家门|门口|门前|附近|楼下|楼上|住处|所在|对面|一带|院内|院里|周边|旁边|[东西南北]侧|[东西南北]门|处|旁|内|外|前|后))`)

/**
 * Words that make what follows a street address another place there: a hospital or a clinic, whose address a record
 * names on its own. Any other copy (…12号小卖店, …251号某某公司, …233号菜市场) is replaced like the home; a skipped copy is
 * still reported by the leftover check, which looks for the street address of every replaced address.
 */
const ANOTHER_PLACE = /^[ \t]*[\u4e00-\u9fff]{0,6}?(?:医院|卫生院|诊所|门诊部|卫生服务中心)/

/** Whether a copy of a street address that ends at `end` is the home, not the start of another place there (…88号某某医院, …88号单位内). */
export function streetCopyStands(text: string, end: number): boolean {
  const after = text.slice(end, end + 14)
  return MORE_OF_A_HOME.test(after) || !ANOTHER_PLACE.test(after)
}

/**
 * The street address an address starts with when it goes on after a comma, a bracket or a quote mark (…251号（电力局宿舍）,
 * …112号，金色家园3-2-1102, …12号”3栋501室): another copy may stop there, or leave out the comma, the brackets or the
 * quotes. Null when there is no such part, or it has no house number (a road or a district alone is no home).
 */
export function addressBase(value: string): string | null {
  const text = normalizeText(value)
  // OCR's gap may stand for the comma (…12号 锦绣华庭3栋501室); a gap inside the places goes on (江苏省 南京市…).
  for (const match of text.matchAll(/[,(“”"「」『』]|[ \t]+(?=[\u4e00-\u9fff\d])/g)) {
    const base = text.slice(0, match.index).trim()
    if (base.replace(/\s/g, '').length >= 8 && HOUSE_NUMBER.test(base)) return base
    if (match[0] === ',' || match[0] === '(') return null
  }
  return null
}

/** The identity of a value: digits and letters for numbers (phones without +86), normalized text otherwise (an address without its quote marks). */
export function valueKey(category: PiiCategory, value: string): string {
  if (category === 'phone') return phoneKey(value)
  if (category === 'email') return normalizeText(value).trim().toLowerCase()
  if (category === 'address') return compactAddress(value)
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

/** Finds a value written with or without the spaces and dashes OCR and people add (and line breaks, for an address). Run it on normalized text. */
export function valuePattern(category: PiiCategory, value: string): RegExp | null {
  if (!NUMERIC.has(category)) {
    const core = looseTextPattern(value, category === 'address')
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
  const ownSpelling = normalizeText(value).trim()
  // The head of a cut number that is a year and month or a date (住院号：2024-01-\n0015) is found again only as the head of a
  // number: cut after its dash too (住院号 2024-01-  科室：…), or with the rest of a number after it (门诊号 2023-11-0087),
  // never with a day, a year and month, a line of digits or 至今 after it: that is a date or a period. Its own spelling is no exception.
  if (EXACT_ONLY.has(category) && readsAsDateHead(ownSpelling)) {
    const spots: ValueSpot[] = []
    for (const spot of findSpots(text, category, ownSpelling.slice(0, -1), runs, '')) {
      if (HEAD_REST.test(text.slice(spot.end, spot.end + 24))) spots.push({ ...spot, end: spot.end + (/^-\d/.test(text.slice(spot.end, spot.end + 2)) ? 0 : 1) })
    }
    return spots
  }
  return findSpots(text, category, value, runs, ownSpelling)
}

/**
 * After the head of a cut number: its dash, then no digit and no 至今 on that line or the next (the dash is taken too), or
 * the rest of a number (three digits or more, no year and month), which keeps its own digits as main did (2023-11-0087).
 */
const HEAD_REST = /^-(?:(?![ \t]*\n?[ \t]*(?:\d|至今|迄今|以来|今|现在|目前))|(?=(?!(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?!\d))\d{3,}(?!\d)))/

/** findValue, where `ownSpelling` is the spelling that counts even when it reads as a date ('' for none). */
function findSpots(text: string, category: PiiCategory, value: string, runs: NumberRun[] | undefined, ownSpelling: string): ValueSpot[] {
  const key = valueKey(category, value)
  const spots: ValueSpot[] = []
  if (NUMERIC.has(category) && allowsSeparators(category, key)) {
    for (const run of runs ?? numberRuns(text)) {
      for (const variant of runKeys(category, key)) {
        for (const found of run.find(variant.key, variant.whole)) {
          // The value's own spelling always counts, even when it looks like a date, except as the year of one
          // (住院号：2020 against 入院日期：2020/02/22, 2019年7月16日).
          const written = text.slice(found.start, found.end)
          if (EXACT_ONLY.has(category) && written !== ownSpelling && readsAsDate(written)) continue
          if (EXACT_ONLY.has(category) && yearOfDate(text, found.start, found.end)) continue
          spots.push({ ...withPlus(text, found), ...(variant.whole && variant.key !== key && { localOnly: true }) })
        }
      }
    }
    // A value that a line break cut where it was found is also found cut elsewhere, with an indent, blank lines, a
    // CR or a dash around the break (门诊号 MZ-2024-\n 0115001, MZ-2025-18069\n\n23), which number runs do not bridge.
    if (ownSpelling.includes('\n') && key.length >= MIN_LOOSE_NUMBER) {
      const pattern = [...key].map(escapeRegExp).join('[\\s-]{0,6}')
      for (const match of text.matchAll(new RegExp(`(?<![0-9A-Za-z])${pattern}(?![0-9A-Za-z])`, 'gi'))) {
        const start = match.index ?? 0
        // As above, never a date (2\n0240602 against 2024-06-02).
        if (EXACT_ONLY.has(category) && (readsAsDate(match[0]) || readsAsDate(match[0].replace(/\s+/g, ' ')))) continue
        if (!spots.some((spot) => spot.start === start)) spots.push({ start, end: start + match[0].length })
      }
    }
    return spots
  }
  const regex = valuePattern(category, value)
  if (!regex) return spots
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (EXACT_ONLY.has(category) && (yearOfDate(text, start, end) || yearMonthOfDate(text, start, end))) continue
    spots.push({ start, end })
  }
  return spots
}

/** Widen a span over a "+" right before it, so +8613912345678 is replaced whole. */
export function withPlus(text: string, span: { start: number; end: number }): { start: number; end: number } {
  return text[span.start - 1] === '+' ? { start: span.start - 1, end: span.end } : span
}
