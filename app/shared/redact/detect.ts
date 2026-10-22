/**
 * Candidate pipeline. Detectors are pluggable: the defaults are "My info" and
 * the rules; an on-device model can be added as another detector (new
 * candidates) or as a reviewer (a second opinion on unsure ones). A reviewer
 * may change certainty, suggestion or category, but never removes a candidate,
 * so the user always sees what the rules found.
 *
 * After detection, every value proposed for replacement is looked for again
 * on every page ("propagation"), so a name found once under 姓名 is also found
 * where it reappears in the narrative. The leftover check uses the same
 * matching, which keeps the two from disagreeing.
 */
import { nameEdge } from './names'
import { profileDetector } from './profile'
import { ruleDetector } from './rules'
import { normalizeText } from './text'
import { findValue, NUMERIC, numberRuns, valueKey } from './values'
import type { Candidate, Certainty, Decision, DraftCandidate, PiiCategory, Profile, SourceDocument } from './types'

export interface DetectorContext {
  profile: Profile
}

export interface Detector {
  readonly id: string
  detect(doc: SourceDocument, context: DetectorContext): DraftCandidate[] | Promise<DraftCandidate[]>
}

export interface CandidateOpinion {
  id: string
  certainty?: Certainty
  suggestion?: Decision
  category?: PiiCategory
}

export interface CandidateReviewer {
  readonly id: string
  review(candidates: Candidate[], docs: SourceDocument[]): Promise<CandidateOpinion[]>
}

/** Earlier detectors win where spans overlap: what the user told us beats a rule. */
export function defaultDetectors(): Detector[] {
  return [profileDetector(), ruleDetector()]
}

export function candidateId(draft: Pick<DraftCandidate, 'docId' | 'page' | 'start' | 'end'>): string {
  return `${draft.docId}:${draft.page}:${draft.start}-${draft.end}`
}

export interface FindOptions {
  detectors?: Detector[]
  reviewer?: CandidateReviewer
}

/** Propagation looks for at most this many distinct values; real records have far fewer. */
const MAX_PROPAGATED_VALUES = 500

/** Detectors see normalized text (１３９ → 139, every space a space); offsets are unchanged. */
function normalized(doc: SourceDocument): SourceDocument {
  return { ...doc, pages: doc.pages.map((page) => ({ ...page, text: normalizeText(page.text) })) }
}

/**
 * Add a draft unless it overlaps one already taken. Two exceptions, where a
 * longer draft fully covers shorter ones and replaces them:
 * - a name over glued, unsure name fragments, so the rule's 张伟华 under 姓名
 *   beats "My info"'s 张伟 inside it;
 * - a number or address found again (same value) over what the rules took of
 *   the same kind on this spot, from the same start: a value cut short by a
 *   line break or a guess at where a sentence's address ends (居住于…188号，
 *   电力局宿舍…) is replaced whole. A number of another kind takes over only
 *   where a line break cut the find. Only a country code in front (86 before
 *   a mobile, often an age or a pulse in the cell before) never counts as more.
 */
function place(taken: DraftCandidate[], draft: DraftCandidate, text = ''): boolean {
  const clashes = taken.filter((other) => other.page === draft.page && draft.start < other.end && other.start < draft.end)
  if (clashes.length === 0) {
    taken.push(draft)
    return true
  }
  const covers = (other: DraftCandidate): boolean =>
    draft.start <= other.start && other.end <= draft.end && draft.end - draft.start > other.end - other.start
  // A number of another kind only takes over a find that a line break cut (参保号：3101041\n98710232464).
  const longer = (other: DraftCandidate): boolean => draft.start === other.start && draft.end > other.end
    && (other.category === draft.category || (NUMERIC.has(other.category) && /^[ \t]*\n/.test(text.slice(other.end, draft.end))))
    && (draft.category !== 'phone' || valueKey('phone', text.slice(draft.start, draft.end)) !== valueKey('phone', text.slice(other.start, other.end)))
  const fragments = draft.category === 'name'
    ? clashes.every((other) => other.category === 'name' && other.certainty === 'unsure' && covers(other))
    : draft.reason === 'same_value' && (NUMERIC.has(draft.category) || draft.category === 'address') && clashes.every((other) =>
      (other.source === 'rule' || other.source === 'label') && other.reason !== 'same_value' && longer(other))
  if (!fragments) return false
  for (const other of clashes) taken.splice(taken.indexOf(other), 1)
  taken.push(draft)
  return true
}

/**
 * Look for every replaced value on all pages.
 * - Long numbers are found inside runs of digits and separators, with digits
 *   on neither side, so 13912345678 is found in TEL13912345678 or
 *   139\u00b71234\u00b75678 but never inside a longer card number. A repeat keeps the
 *   original certainty.
 * - Short numbers, record and insurance numbers are found only as written, so
 *   dates are left alone.
 * - Names and addresses are "unsure". A name that stands alone starts as
 *   "replace"; one glued into a longer word (张伟华, 肌张力) starts as "keep"
 *   and the leftover check asks about it until the user decides.
 */
function propagate(docs: SourceDocument[], found: Map<string, DraftCandidate[]>, texts: Map<string, Map<number, string>>): void {
  const sources = new Map<string, DraftCandidate & { text: string }>()
  for (const candidate of [...found.values()].flat()) {
    if (candidate.suggestion !== 'replace') continue
    const text = texts.get(candidate.docId)?.get(candidate.page)?.slice(candidate.start, candidate.end)
    if (!text) continue
    const key = `${candidate.category}\u0000${valueKey(candidate.category, text)}`
    if (!sources.has(key) && sources.size < MAX_PROPAGATED_VALUES) sources.set(key, { ...candidate, text })
  }
  const add = (doc: SourceDocument, page: number, start: number, end: number, origin: DraftCandidate, text: string, localOnly = false): void => {
    const taken = found.get(doc.id) ?? []
    const isName = origin.category === 'name'
    const numeric = NUMERIC.has(origin.category)
    const glued = isName && nameEdge(text, start, end) === 'glued'
    place(taken, {
      docId: doc.id,
      page,
      start,
      end,
      category: origin.category,
      source: origin.source === 'profile' ? 'profile' : 'rule',
      certainty: numeric && !localOnly ? origin.certainty : 'unsure',
      reason: 'same_value',
      suggestion: glued ? 'keep' : 'replace',
      ...(origin.personId && { personId: origin.personId }),
      ...(origin.role && { role: origin.role }),
    }, text)
    found.set(doc.id, taken)
  }

  const origins = [...sources.values()]
  for (const doc of docs) {
    for (const page of doc.pages) {
      const text = texts.get(doc.id)?.get(page.page) ?? ''
      const runs = numberRuns(text)
      for (const origin of origins) {
        for (const spot of findValue(text, origin.category, origin.text, runs)) {
          add(doc, page.page, spot.start, spot.end, origin, text, spot.localOnly)
        }
      }
    }
  }
}

export async function findCandidates(docs: SourceDocument[], context: DetectorContext, options: FindOptions = {}): Promise<Candidate[]> {
  const detectors = options.detectors ?? defaultDetectors()
  const found = new Map<string, DraftCandidate[]>()
  const texts = new Map<string, Map<number, string>>()
  for (const original of docs) {
    const doc = normalized(original)
    const pages = new Map(doc.pages.map((page) => [page.page, page.text]))
    texts.set(doc.id, pages)
    const taken: DraftCandidate[] = []
    for (const detector of detectors) {
      const drafts = await detector.detect(doc, context)
      for (const draft of [...drafts].sort((a, b) => a.page - b.page || a.start - b.start || b.end - a.end)) {
        const text = pages.get(draft.page)
        if (text === undefined || draft.docId !== doc.id || draft.start < 0 || draft.end > text.length || draft.end <= draft.start) continue
        place(taken, draft)
      }
    }
    found.set(doc.id, taken)
  }
  propagate(docs, found, texts)

  const originals = new Map(docs.map((doc) => [doc.id, new Map(doc.pages.map((page) => [page.page, page.text]))]))
  const accepted: Candidate[] = []
  for (const [docId, drafts] of found) {
    for (const draft of drafts) {
      const text = originals.get(docId)?.get(draft.page) ?? ''
      accepted.push({ ...draft, id: candidateId(draft), value: text.slice(draft.start, draft.end) })
    }
  }
  const order = new Map(docs.map((doc, index) => [doc.id, index]))
  accepted.sort((a, b) => compareCandidates(a, b, order))
  if (!options.reviewer) return accepted

  const opinions = new Map((await options.reviewer.review(accepted, docs)).map((opinion) => [opinion.id, opinion]))
  return accepted.map((candidate) => {
    const opinion = opinions.get(candidate.id)
    if (!opinion) return candidate
    return {
      ...candidate,
      ...(opinion.certainty && { certainty: opinion.certainty }),
      ...(opinion.suggestion && { suggestion: opinion.suggestion }),
      ...(opinion.category && { category: opinion.category }),
    }
  })
}

/** Document order, then page, then position. */
export function compareCandidates(a: Candidate, b: Candidate, docOrder?: Map<string, number>): number {
  const docA = docOrder?.get(a.docId) ?? 0
  const docB = docOrder?.get(b.docId) ?? 0
  return docA - docB || a.page - b.page || a.start - b.start
}

/** The decision each candidate starts with: the detector's suggestion. */
export function initialDecisions(candidates: Candidate[]): Record<string, Decision> {
  return Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.suggestion]))
}
