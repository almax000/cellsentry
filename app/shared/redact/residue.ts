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
import { EXACT_ONLY, findValue, MIN_LOOSE_NUMBER, NUMERIC, numberRuns, readsAsDate, readsAsSolidDate, valueKey } from './values'

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
/** Nothing more on the line after a code, then a next line of digits only (the group). Sticky: set lastIndex. */
const CUT_TAIL = /[ \t]*\n *(\d(?:[ \t-]?\d)*[Xx]?)(?= *(?:\n|$))/y

interface Target {
  kind: ResidueKind
  category: PiiCategory
  value: string
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
  for (const entry of book.entries) for (const value of entry.values) targets.push({ kind: 'replaced_value', category: entry.category, value })
  for (const term of profileTerms(profile)) targets.push({ kind: 'my_info', category: term.category, value: term.value })

  // The same matching as propagation: 139\u00b71234\u00b75678 and TEL13912345678 count, a longer number does not.
  const runs = numberRuns(text)
  for (const target of targets) {
    for (const spot of findValue(text, target.category, target.value, runs)) push(target.kind, target.category, spot.start, spot.end)
    // Here a known number also counts inside a longer one: a value cut short by a line break where it was
    // replaced may appear whole elsewhere. Copying stops and the user decides; nothing is replaced unasked.
    const key = valueKey(target.category, target.value)
    if (!NUMERIC.has(target.category) || key.length < MIN_LOOSE_NUMBER) continue
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

  // A number code that ends its line, with a line of nothing but digits below it: the rest of a value a
  // line break cut where it was replaced (参保号：社保号1\n383182). The user decides; nothing is replaced unasked.
  const categoryOf = new Map(book.entries.map((entry) => [entry.code, entry.category]))
  for (const span of share.spans) {
    const category = categoryOf.get(span.code)
    if (!category || !NUMERIC.has(category)) continue
    CUT_TAIL.lastIndex = span.end
    const tail = CUT_TAIL.exec(text)
    if (!tail || tail[1].replace(/\D/g, '').length < 3 || readsAsDate(tail[1]) || readsAsSolidDate(tail[1])) continue
    const start = span.end + tail[0].length - tail[1].length
    push('unreviewed', category, start, start + tail[1].length)
  }

  return hits.sort((a, b) => a.start - b.start)
}
