/**
 * Let the user act on leftover-check hits from the share page.
 *
 * A hit inside an existing candidate (for example a default "keep" the user
 * never looked at) resolves to that candidate, so the user's choice becomes
 * an explicit decision on it. Any other hit becomes a new candidate at the
 * exact spot in the original page, borrowing the identity of a matching value
 * (or of the "My info" person it belongs to) so it gets the same code as
 * every other occurrence.
 */
import { candidateId } from './detect'
import { profileTerms } from './profile'
import type { ResidueHit } from './residue'
import { sourceOf, type ShareText } from './share'
import type { Candidate, Profile } from './types'
import { valueKey } from './values'

export interface ResolvedHits {
  added: Candidate[]
  /** Ids of existing candidates that hold a hit entirely. */
  existing: string[]
  /** Ids of candidates a wider leftover now covers; drop them. */
  removed: string[]
}

const samePage = (a: { docId: string; page: number }, b: { docId: string; page: number }): boolean => a.docId === b.docId && a.page === b.page

/**
 * A hit that only partly overlaps candidates (+86 in front of a found phone
 * number) becomes one candidate over both, so keeping or replacing it
 * settles the whole hit and the check does not report it again.
 */
export function resolveHits(hits: ResidueHit[], share: ShareText, candidates: Candidate[], profile: Profile,
  sourceText: (docId: string, page: number) => string | undefined): ResolvedHits {
  let added: Candidate[] = []
  const existing = new Set<string>()
  const removed = new Set<string>()
  const terms = profileTerms(profile)

  for (const hit of hits) {
    const at = sourceOf(share, hit.start, hit.end)
    if (!at) continue
    const live = [...candidates.filter((c) => !removed.has(c.id)), ...added]
    const touching = live.filter((c) => samePage(c, at) && at.start < c.end && c.start < at.end)
    const holder = touching.find((c) => c.start <= at.start && at.end <= c.end)
    if (holder) {
      if (!added.includes(holder)) existing.add(holder.id)
      continue
    }
    const text = sourceText(at.docId, at.page)
    if (text === undefined) continue
    const start = Math.min(at.start, ...touching.map((c) => c.start))
    const end = Math.max(at.end, ...touching.map((c) => c.end))
    for (const c of touching) {
      if (added.includes(c)) {
        added = added.filter((other) => other !== c)
      } else {
        removed.add(c.id)
        existing.delete(c.id)
      }
    }
    const key = valueKey(hit.category, hit.value)
    const twin = candidates.find((c) => c.category === hit.category && valueKey(c.category, c.value) === key)
    const personId = touching.find((c) => c.personId)?.personId ?? twin?.personId
      ?? terms.find((term) => term.category === hit.category && valueKey(term.category, term.value) === key)?.personId
    const person = personId ? profile.people.find((p) => p.id === personId) : undefined
    const role = touching.find((c) => c.role)?.role ?? twin?.role ?? (person ? (person.role === 'self' ? 'patient' : 'family') : undefined)
    const draft = {
      docId: at.docId, page: at.page, start, end, category: hit.category, source: 'rule' as const,
      certainty: 'sure' as const, reason: 'leftover' as const, suggestion: 'replace' as const,
      ...(personId && { personId }),
      ...(hit.category === 'name' && role && { role }),
    }
    added.push({ ...draft, id: candidateId(draft), value: text.slice(start, end) })
  }
  return { added, existing: [...existing], removed: [...removed] }
}

/** Compatibility wrapper: only the new candidates. */
export function leftoverCandidates(hits: ResidueHit[], share: ShareText, candidates: Candidate[], profile: Profile,
  sourceText: (docId: string, page: number) => string | undefined): Candidate[] {
  return resolveHits(hits, share, candidates, profile, sourceText).added
}
