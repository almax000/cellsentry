/**
 * Leftover check: compare the shareable text with everything we know is
 * personal. Copying is blocked while any hit remains.
 *
 * Only spots the user explicitly kept (or marked as not personal) are exempt,
 * and only hits that lie entirely inside such a spot. A default "keep" the
 * user never looked at is not a decision, so it is still reported.
 *
 * What it compares, and nothing more: values already replaced elsewhere,
 * "My info", and numbers the rules can identify. A name the rules never found
 * is not in that set, which the share page says in plain words. File headers
 * the app writes itself (【文件 1】) are never reported.
 */
import { profileTerms } from './profile'
import { detectRules } from './rules'
import type { ShareText } from './share'
import type { CodeBook, PiiCategory, Profile } from './types'
import { normalizeText } from './text'
import { addressBase, EXACT_ONLY, findValue, MIN_LOOSE_NUMBER, numberRuns, NUMERIC, readsAsDate, readsAsDateHead, readsAsSolidDate, readsAsYearMonth, valueKey } from './values'

export type ResidueKind = 'replaced_value' | 'my_info' | 'unreviewed'

export interface ResidueHit {
  kind: ResidueKind
  category: PiiCategory
  value: string
  start: number
  end: number
}

const STRUCTURED: ReadonlySet<PiiCategory> = new Set(['phone', 'id_number', 'social_security', 'bank_card', 'email', 'record_number'])
/** The check stops listing after this many; one is enough to block copying. */
export const MAX_RESIDUE_HITS = 500
/**
 * Nothing more on the line after a code, then the next line's digits (the group): with single spaces, tabs or
 * dashes, or once OCR's two spaces (only under a number that may be cut), up to the end of that line or, the rest
 * of a wrapped row, up to a label (the spaces before it are the second group). Sticky: set lastIndex.
 */
const CUT_TAIL = /[ \t]*\n *(\d(?:[ \t-]?\d)*(?: {2}\d(?:[ \t-]?\d)*)?[Xx]?)(?= *(?:\n|$)|( +)[\u4e00-\u9fffA-Za-z()/]{1,16} *:)/y
/** Numbers that a wrapped row may leave at the start of the next line: a record or an insurance number has no checksum. */
const UNCHECKED: ReadonlySet<PiiCategory> = new Set(['record_number', 'social_security'])
/** A record or insurance number this long is whole more often than cut, unless it ends in a dash and one or two digits (TJ-2023-0305-4\n671). */
const LONG_UNCHECKED = 10

/**
 * Whether digits with one of OCR's two-space gaps read as one number that OCR cut there, not as two values of a
 * row (120  80, 138  186): one side is a single digit (8  147, 0472  4), five digits or more follow the gap
 * (0  412289), or there are seven or more in all (025591  10).
 */
function oneNumber(group: string): boolean {
  const parts = group.split(/ {2}/).map((part) => part.replace(/\D/g, ''))
  if (parts.length === 1) return true
  const [left, right] = parts
  return left.length === 1 || right.length === 1 || right.length >= 5 || left.length + right.length >= 7
}

/**
 * Whether one to four digits at a line's start number its row: one of the next three lines starts with the next
 * number (001  床位费…\n002  西药费…, also with a note or a blank line between and no space after it).
 */
function numbersRows(text: string, start: number, digits: string): boolean {
  if (!/^\d{1,4}$/.test(digits)) return false
  const next = String(Number(digits) + 1).padStart(digits.length, '0')
  let lineEnd = text.indexOf('\n', start)
  for (let line = 0; line < 3 && lineEnd >= 0; line++) {
    if (text.startsWith(next, lineEnd + 1) && !/\d/.test(text[lineEnd + 1 + next.length] ?? '')) return true
    lineEnd = text.indexOf('\n', lineEnd + 1)
  }
  return false
}

/** The digits a line break cut off a number where it was found (MZ-2024-\n0115001 → 0115001), for each such value of an entry. */
function cutRests(category: PiiCategory, values: string[]): string[] {
  const rests: string[] = []
  for (const value of values) {
    const written = normalizeText(value)
    if (!written.includes('\n')) continue
    const key = valueKey(category, written)
    const headKey = valueKey(category, written.slice(0, written.indexOf('\n')))
    if (key.startsWith(headKey) && /^\d{3,}$/.test(key.slice(headKey.length))) rests.push(key.slice(headKey.length))
  }
  return rests
}

/** Whether a number from `start` to `end` stands alone in the text: see the short phones in checkResidue. */
function standsAlone(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 12), start).replace(/\s+$/, '')
  const after = text.slice(end, end + 12).replace(/^\s+/, '')
  const side = (mark: string, beyond: string): boolean => mark === '' || /[\u4e00-\u9fff]/.test(mark)
    || (/[,;:()\[\]“”"'、。【】]/.test(mark) && !/[0-9A-Za-z]/.test(beyond))
  return side(before.slice(-1), before.slice(0, -1).replace(/\s+$/, '').slice(-1))
    && side(after.slice(0, 1), after.slice(1).replace(/^\s+/, '').slice(0, 1))
}

/** A labelled short phone's equal digits can also be an explicitly named lab value, amount or count. */
function otherNumber(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(text.lastIndexOf('\n', start - 1) + 1, start - 40), start)
  return /(?:检验号|检查号|标本(?:号|量)|样本(?:号|量)|计数|(?:总)?费用|金额)[ \t]*:?[ \t]*$/.test(before)
    || (/第[ \t]*$/.test(before) && /^[ \t]*(?:次|例|天|周|岁|床|项|页)/.test(text.slice(end)))
}

interface Target {
  kind: ResidueKind
  category: PiiCategory
  value: string
  personId?: string
}

export function checkResidue(share: ShareText, book: CodeBook, profile: Profile): ResidueHit[] {
  const original = share.text
  const text = normalizeText(original)
  const hits: ResidueHit[] = []
  const inside = (span: { start: number; end: number }, start: number, end: number): boolean => span.start <= start && end <= span.end
  const overlapping = (span: { start: number; end: number }, start: number, end: number): boolean => start < span.end && span.start < end
  const push = (kind: ResidueKind, category: PiiCategory, start: number, end: number): void => {
    if (hits.length >= MAX_RESIDUE_HITS || end <= start) return
    if (!share.pieces.some((piece) => inside(piece, start, end))) return
    if (share.spans.some((span) => overlapping(span, start, end))) return
    if (share.kept.some((span) => inside(span, start, end))) return
    if (hits.some((hit) => overlapping(hit, start, end))) return
    hits.push({ kind, category, value: original.slice(start, end), start, end })
  }

  const targets: Target[] = []
  for (const entry of book.entries) {
    for (const value of entry.values) {
      // A guess at a few phone digits (联系电话：0571\n8723…, 电话 86021 …) is not looked for: its copies are other numbers. A short
      // number from "My info" or under a phone label (联系电话：66123) is.
      if (entry.guesses?.includes(value)) continue
      targets.push({ kind: 'replaced_value', category: entry.category, value, personId: entry.personId })
      // The street address a longer home starts with (…中山路12号 of …中山路12号（锦绣华庭）): propagation leaves
      // a copy that goes on as a hospital, so it is reported here and the user decides.
      const base = entry.category === 'address' ? addressBase(value) : null
      if (base) targets.push({ kind: 'replaced_value', category: 'address', value: base })
    }
  }
  for (const term of profileTerms(profile)) targets.push({ kind: 'my_info', category: term.category, value: term.value })

  // The same matching as propagation: 139\u00b71234\u00b75678 and TEL13912345678 count, a longer number does not.
  const runs = numberRuns(text)
  for (const target of targets) {
    // A short phone found under a label is looked for only as itself and only where it stands alone: no country code, and next to it,
    // across spaces and line breaks, Chinese, nothing, or a punctuation mark with no digit or letter beyond it, never a digit, a
    // letter or another mark of a number (45612 3, 2023\n45612, CT 45612, No.45612, 66123.50, 45612·00, 1∶45612, 45600~45612).
    const short = target.kind === 'replaced_value' && target.category === 'phone' && valueKey('phone', target.value).length < MIN_LOOSE_NUMBER
    for (const spot of findValue(text, target.category, target.value, runs)) {
      if (short && (valueKey('phone', text.slice(spot.start, spot.end)) !== valueKey('phone', target.value) || !standsAlone(text, spot.start, spot.end))) continue
      // "My info" remains authoritative; only a phone inferred under a label can instead be an explicit clinical number here.
      if (short && !target.personId && otherNumber(text, spot.start, spot.end)) continue
      push(target.kind, target.category, spot.start, spot.end)
    }
    // Here a known number also counts inside a longer one: a value cut short by a line break where it was
    // replaced may appear whole elsewhere. Copying stops and the user decides; nothing is replaced unasked.
    const key = valueKey(target.category, target.value)
    // Never the head of a cut number that is a date (住院号：20240115-\n0021): inside a longer run it is the date itself.
    if (!NUMERIC.has(target.category) || key.length < MIN_LOOSE_NUMBER || (EXACT_ONLY.has(target.category) && readsAsDateHead(target.value))) continue
    for (const run of runs) {
      for (const span of run.find(key, false, true)) {
        if (EXACT_ONLY.has(target.category) && readsAsDate(text.slice(span.start, span.end))) continue
        push(target.kind, target.category, span.start, span.end)
      }
    }
  }

  const doc = { id: 'share', name: '', kind: 'text' as const, pages: [{ page: 1, text, source: 'paste' as const }] }
  for (const found of detectRules(doc)) {
    if (found.certainty !== 'sure' || !STRUCTURED.has(found.category)) continue
    push('unreviewed', found.category, found.start, found.end)
  }

  // A number code that ends its line, with a line that starts with nothing but digits below it: the rest of a
  // value a line break cut where it was replaced (参保号：社保号1\n383182). The user decides; nothing is replaced unasked.
  const entryOf = new Map(book.entries.map((entry) => [entry.code, entry]))
  for (const span of share.spans) {
    const entry = entryOf.get(span.code)
    if (!entry || !NUMERIC.has(entry.category)) continue
    const category = entry.category
    CUT_TAIL.lastIndex = span.end
    const tail = CUT_TAIL.exec(text)
    if (!tail || tail[1].replace(/\D/g, '').length < 3 || readsAsDate(tail[1]) || readsAsSolidDate(tail[1]) || readsAsYearMonth(tail[1])) continue
    const start = span.end + tail[0].length - tail[1].length
    // A record or insurance number that may be cut: short, joined over a line break, or ending in a dash and a digit or two.
    const mayBeCut = UNCHECKED.has(category) && !entry.values.some((value) => !value.includes('\n')
      && valueKey(category, value).length >= LONG_UNCHECKED && !/-[ \t]*\d{1,2}$/.test(normalizeText(value).trim()))
    // OCR's two spaces only under such a number, and at a line's end only where the digits read as one number: under a
    // whole phone, ID or card, two values with that gap are a row (联系电话：139…\n3  26).
    if (/ {2}/.test(tail[1]) && (!mayBeCut || (tail[2] === undefined && !oneNumber(tail[1])))) continue
    // Before a label, only under such a number (住院号：ZY2024\n35246  床号：12, 住院号：ZY20233\n02  26  床号：39), and never
    // a row's number (001  床位费：…\n002  …).
    if (tail[2] !== undefined && (!mayBeCut || numbersRows(text, start, tail[1]))) continue
    push('unreviewed', category, start, start + tail[1].length)
  }

  // A copy of a number that a line break cut where it was found may be cut elsewhere too, after an indent, a blank line
  // or a table cell (门诊号 编号1  科室：内科\n0115001): its rest at the start of one of the next lines is asked about.
  for (const span of share.spans) {
    const entry = entryOf.get(span.code)
    if (!entry || !EXACT_ONLY.has(entry.category)) continue
    for (const rest of cutRests(entry.category, entry.values)) {
      const ahead = text.slice(span.end, span.end + 240)
      const found = new RegExp(`\n[ \t\n]*(${[...rest].join('[ \t-]?')})(?![0-9A-Za-z])`).exec(ahead.split('\n').slice(0, 4).join('\n'))
      if (found) {
        const start = span.end + found.index + found[0].length - found[1].length
        push('unreviewed', entry.category, start, start + found[1].length)
      }
    }
  }

  return hits.sort((a, b) => a.start - b.start)
}
