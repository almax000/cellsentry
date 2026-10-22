/**
 * "My info": the people the user tells us about. A value from this table is
 * found exactly, so a hit is "sure" without any guessing.
 */
import type { Detector } from './detect'
import { nameEdge } from './names'
import type { DraftCandidate, PiiCategory, Profile, ProfilePerson, SourceDocument } from './types'
import { compactPhone, normalizeText } from './text'
import { findValue, numberRuns, valuePattern } from './values'

type ProfileField = 'name' | 'idNumber' | 'phone' | 'socialSecurity' | 'address'

export const PROFILE_FIELDS: Array<{ key: ProfileField; category: PiiCategory; numeric: boolean }> = [
  { key: 'name', category: 'name', numeric: false },
  { key: 'idNumber', category: 'id_number', numeric: true },
  { key: 'phone', category: 'phone', numeric: true },
  { key: 'socialSecurity', category: 'social_security', numeric: true },
  { key: 'address', category: 'address', numeric: false },
]

export interface ProfileTerm {
  personId: string
  role: ProfilePerson['role']
  category: PiiCategory
  value: string
  regex: RegExp
}

/**
 * Regexes for every value in "My info". They are built from normalized values
 * and run on normalized text, the same way the leftover check does, so a
 * full-width address typed into "My info" still matches.
 */
export function profileTerms(profile: Profile): ProfileTerm[] {
  const terms: ProfileTerm[] = []
  for (const person of profile.people) {
    for (const field of PROFILE_FIELDS) {
      const raw = person[field.key]?.trim()
      if (!raw) continue
      const value = field.key === 'phone' ? compactPhone(raw) : normalizeText(raw).trim()
      const regex = valuePattern(field.category, value)
      if (!regex) continue
      terms.push({ personId: person.id, role: person.role, category: field.category, value, regex })
    }
  }
  return terms
}

export function profileDetector(): Detector {
  return {
    id: 'profile',
    detect(doc: SourceDocument, { profile }): DraftCandidate[] {
      const terms = profileTerms(profile)
      const found: DraftCandidate[] = []
      for (const page of doc.pages) {
        const runs = numberRuns(page.text)
        for (const term of terms) {
          for (const { start, end, localOnly } of findValue(page.text, term.category, term.value, runs)) {
            // A name glued into a longer word (张伟 in 张伟华) is probably someone else: shown, not replaced.
            const glued = term.category === 'name' && nameEdge(page.text, start, end) === 'glued'
            found.push({
              docId: doc.id,
              page: page.page,
              start,
              end,
              category: term.category,
              source: 'profile',
              certainty: glued || localOnly ? 'unsure' : 'sure',
              reason: 'profile_match',
              suggestion: glued ? 'keep' : 'replace',
              personId: term.personId,
              ...(term.category === 'name' && { role: term.role === 'self' ? 'patient' : 'family' }),
            })
          }
        }
      }
      return found
    },
  }
}
