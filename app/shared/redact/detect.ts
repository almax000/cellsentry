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
import { addressBase, findValue, NUMERIC, numberRuns, streetCopyStands, valueKey } from './values'
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
 *   A longer value found again also takes over a shorter one of its kind found
 *   again on the same spot (MZ20250\n810889 over MZ20250), and an address one
 *   found again inside it (a home over its street address). A phone found
 *   again takes over a guess at phone digits (phone_under_label) that it goes
 *   on past, from where the guess's own digits start.
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
  // A record or insurance number found again over digits a rule only guessed were a landline (医保号 09735400277, ZJ 02701054770).
  const sameDigits = (other: DraftCandidate): boolean => (draft.category === 'social_security' || draft.category === 'record_number')
    && other.category === 'phone' && other.reason === 'landline_phone' && other.certainty === 'unsure' && draft.start <= other.start && other.end <= draft.end
  // A guess at digits after a phone label or word gives way to a phone found again over it (+86 10 28\n70 5 819 over 86 10 28).
  // The phone starts inside the guess, after at most a short group (an index or a country code: (2) 139 1234\n5678, +86 0571 …),
  // never on a number before it (an age of 86 in the cell before).
  const guess = (other: DraftCandidate): boolean => draft.category === 'phone' && other.category === 'phone' && other.reason === 'phone_under_label'
    && other.certainty === 'unsure' && other.start <= draft.start && other.end < draft.end
    && text.slice(other.start, draft.start).replace(/\D/g, '').length <= 4
    && valueKey('phone', text.slice(draft.start, draft.end)) !== valueKey('phone', text.slice(other.start, other.end))
  const fragments = draft.category === 'name'
    ? clashes.every((other) => other.category === 'name' && other.certainty === 'unsure' && covers(other))
    : draft.reason === 'same_value' && (NUMERIC.has(draft.category) || draft.category === 'address') && clashes.every((other) =>
      (other.source === 'rule' || other.source === 'label') && (other.reason !== 'same_value' || other.category === draft.category)
      && (longer(other) || sameDigits(other) || guess(other) || (draft.category === 'address' && other.category === 'address' && other.reason === 'same_value' && covers(other))))
  if (!fragments) return false
  for (const other of clashes) taken.splice(taken.indexOf(other), 1)
  taken.push(draft)
  return true
}

/**
 * An unsure phone after a phone word, or under a phone label with fewer digits than any phone: a guess at a cut number,
 * not a value to look for.
 */
function phoneGuess(candidate: Pick<DraftCandidate, 'category' | 'reason' | 'certainty' | 'label'>, text: string): boolean {
  return candidate.category === 'phone' && candidate.reason === 'phone_under_label' && candidate.certainty === 'unsure'
    && (!candidate.label || valueKey('phone', text).length < 7)
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
 *   and the leftover check asks about it until the user decides. An address
 *   in running text that goes on past a comma or a bracket is also looked for
 *   by the street address it starts with (addressBase), as other copies may
 *   stop there; such a find shares the code of the whole address (sameAs),
 *   and so does a labelled copy that is just that street address, unless two
 *   different addresses start with it.
 */
/** A relative's word right before the words that start an address in running text (其母居住于, 其子现住, 家属家住). */
const RELATIVE_LIVES_AT = /(?<![与随和同及跟])(?:母亲?|父亲?|儿子|女儿|妻子|丈夫|配偶|家属|家人|亲属|爱人|老伴|其[母父子女妻夫兄弟姐妹])[ \t]*(?:现|亦|也|均)?(?:家住在|家住|现住于|现住在|现住|现居住于|现居住在|现居于|现居在|现居|居住于|居住在|住在)[ \t]*:?[ \t]*$/

/** A patient who lives with a relative (与老伴居住于, 随父母居住于, 及家属现住): the home is the patient's. */
const WITH_RELATIVE = /[与随和同及跟][^，,。；;\n]{0,5}(?:家住在|家住|现住于|现住在|现住|现居住于|现居住在|现居于|现居在|现居|居住于|居住在|住在)[ \t]*:?[ \t]*$/

function propagate(docs: SourceDocument[], found: Map<string, DraftCandidate[]>, texts: Map<string, Map<number, string>>): void {
  const sources = new Map<string, DraftCandidate & { text: string; street?: boolean }>()
  /** For the street address of each address in running text: the whole addresses that start with it, by key. */
  const wholesOf = new Map<string, Map<string, string>>()
  /** The same for the first line of a record or insurance number joined over a line break. */
  const joinedOf = new Map<string, Map<string, string>>()
  const textOf = (candidate: DraftCandidate): string | undefined => texts.get(candidate.docId)?.get(candidate.page)?.slice(candidate.start, candidate.end)
  // Digits of record and insurance numbers: a landline a rule only guessed at with these digits is that number, not a phone.
  const numbers = new Set([...found.values()].flat().filter((candidate) => candidate.category === 'record_number' || candidate.category === 'social_security')
    .map((candidate) => (textOf(candidate) ?? '').replace(/\D/g, '')))
  for (const candidate of [...found.values()].flat()) {
    if (candidate.suggestion !== 'replace') continue
    const text = textOf(candidate)
    if (!text) continue
    if (candidate.category === 'phone' && candidate.reason === 'landline_phone' && candidate.certainty === 'unsure' && numbers.has(text.replace(/\D/g, ''))) continue
    // Nor a guess at phone digits (联系电话：0571\n8723…, 电话 86021 …): its copies are other numbers.
    if (phoneGuess(candidate, text)) continue
    // A home in running text after a relative's word is the relative's (其母居住于…): its street address is found
    // again, but lends a labelled copy of the street address no code.
    const pageText = texts.get(candidate.docId)?.get(candidate.page) ?? ''
    const before = pageText.slice(Math.max(0, candidate.start - 16), candidate.start)
    const relative = RELATIVE_LIVES_AT.test(before) && !WITH_RELATIVE.test(before)
    const base = candidate.reason === 'address_in_text' ? addressBase(text) : null
    if (base && !relative) {
      const wholes = wholesOf.get(valueKey('address', base)) ?? new Map<string, string>()
      wholesOf.set(valueKey('address', base), wholes.set(valueKey('address', text), text))
    }
    // A record or insurance number joined over a line break is looked for by its first line too, as copies may stop
    // there (样本号MZ20 已复核): a first line with a letter in it, long enough to be found as written.
    const firstLine = (candidate.category === 'record_number' || candidate.category === 'social_security') && text.includes('\n')
      ? text.slice(0, text.indexOf('\n')).trim() : ''
    // A first line that is a year and month or a date (住院号：2024-01-\n0015) is found only where it is cut too (findValue).
    const head = (/[A-Za-z]/.test(firstLine) && valueKey(candidate.category, firstLine).length >= 4)
      || (/-$/.test(firstLine) && valueKey(candidate.category, firstLine).length >= 6) ? firstLine : null
    if (head) {
      const joined = joinedOf.get(`${candidate.category}\u0000${valueKey(candidate.category, head)}`) ?? new Map<string, string>()
      joinedOf.set(`${candidate.category}\u0000${valueKey(candidate.category, head)}`, joined.set(valueKey(candidate.category, text), text))
    }
    const spellings = [{ spelling: text, street: false }, ...(base ? [{ spelling: base, street: true }] : []), ...(head ? [{ spelling: head, street: false }] : [])]
    for (const { spelling, street } of spellings) {
      const key = `${candidate.category}\u0000${valueKey(candidate.category, spelling)}`
      if (!sources.has(key) && sources.size < MAX_PROPAGATED_VALUES) {
        sources.set(key, { ...candidate, text: spelling, ...(spelling !== text && { sameAs: text }), ...(street && { street }) })
      }
    }
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
      ...(origin.sameAs && { sameAs: origin.sameAs }),
    }, text)
    found.set(doc.id, taken)
  }

  // A street address that starts two different addresses is that street address alone, with a code of its own.
  for (const source of sources.values()) {
    if (source.sameAs && (wholesOf.get(valueKey('address', source.text))?.size ?? 0) > 1) delete source.sameAs
  }
  // Addresses longest first, so a copy of a whole home is taken before its street address inside it.
  const listed = [...sources.values()]
  const addresses = listed.filter((origin) => origin.category === 'address').sort((a, b) => b.text.length - a.text.length)
  let nextAddress = 0
  const origins = listed.map((origin) => (origin.category === 'address' ? addresses[nextAddress++] : origin))
  for (const doc of docs) {
    for (const page of doc.pages) {
      const text = texts.get(doc.id)?.get(page.page) ?? ''
      const runs = numberRuns(text)
      for (const origin of origins) {
        for (const spot of findValue(text, origin.category, origin.text, runs)) {
          // A street address is found again only as the home, not where another place there starts (…88号某某医院).
          if (origin.street && !streetCopyStands(text, spot.end)) continue
          add(doc, page.page, spot.start, spot.end, origin, text, spot.localOnly)
        }
      }
    }
  }
  for (const [docId, taken] of found) {
    for (const draft of taken) {
      if (draft.sameAs) continue
      const own = texts.get(docId)?.get(draft.page)?.slice(draft.start, draft.end)
      if (own === undefined) continue
      // So does a labelled copy of the first line of one record or insurance number joined over a line break (样本号：JY07).
      const wholes = draft.category === 'address' ? wholesOf.get(valueKey('address', own))
        : joinedOf.get(`${draft.category}\u0000${valueKey(draft.category, own)}`)
      if (wholes?.size === 1) draft.sameAs = [...wholes.values()][0]
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
