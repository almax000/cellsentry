/**
 * Consistent codes: the same person or number gets the same code in every
 * file, so the AI can compare reports across years. People from "My info" get
 * fixed letters (the user is always A), which keeps codes stable between runs.
 *
 * Codes are handed out to every candidate in document order, whether or not
 * it is replaced. Keeping one value therefore never renumbers the others, so
 * a code the user already pasted into an AI keeps meaning the same thing.
 */
import type { Candidate, CodeBook, CodeEntry, CodeLocale, Decision, NameRole, PiiCategory, Profile } from './types'
import { compactText } from './text'
import { valueKey } from './values'

type CodeKind = 'patient' | 'family' | 'doctor' | 'person' | Exclude<PiiCategory, 'name'>

export const CODE_PREFIX: Record<CodeLocale, Record<CodeKind, string>> = {
  zh: {
    patient: '患者', family: '家人', doctor: '医生', person: '人名', phone: '电话', id_number: '证件',
    social_security: '社保号', bank_card: '银行卡', email: '邮箱', address: '地址', record_number: '编号',
  },
  en: {
    patient: 'Patient-', family: 'Family-', doctor: 'Doctor-', person: 'Person-', phone: 'Phone-', id_number: 'ID-',
    social_security: 'Insurance-', bank_card: 'Card-', email: 'Email-', address: 'Address-', record_number: 'Record-',
  },
}

/** People are lettered (患者A, 家人B); everything else is numbered (电话1). */
const LETTERED: ReadonlySet<CodeKind> = new Set(['patient', 'family'])

export function letters(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

const KIND_RANK: Record<string, number> = { patient: 0, family: 1, person: 2, doctor: 3 }

function kindOf(candidate: Candidate, roleOfPerson: Map<string, 'self' | 'family'>): CodeKind {
  if (candidate.category !== 'name') return candidate.category
  if (candidate.personId) return roleOfPerson.get(candidate.personId) === 'self' ? 'patient' : 'family'
  const role: NameRole = candidate.role ?? 'other'
  return role === 'other' ? 'person' : role
}

/**
 * Who or what a candidate is. A name from "My info" is that person; every
 * other value is its normalized spelling, so the same phone number gets one
 * code whether "My info" or a rule found it.
 */
export function identityOf(candidate: Candidate): string {
  if (candidate.category === 'name') {
    return candidate.personId ? `person:${candidate.personId}` : `name:${compactText(candidate.value)}`
  }
  return `${candidate.category}:${valueKey(candidate.category, candidate.value)}`
}

export interface CodeAssignment {
  book: CodeBook
  /** Candidate id → code, for every candidate the user chose to replace. */
  codeFor: Record<string, string>
}

/**
 * Assign codes. Candidates must be in document order so numbering follows the
 * order of first appearance. Only replaced candidates get a code in `codeFor`
 * and an entry in the book.
 *
 * `seed` maps identities to codes already handed out (the code list frozen
 * when the shareable text was copied). Those identities keep their codes and
 * no other identity can take them, so an answer about the copied text always
 * restores to the right person.
 */
export function assignCodes(candidates: Candidate[], decisions: Record<string, Decision>, profile: Profile,
  locale: CodeLocale, seed: ReadonlyMap<string, string> = new Map()): CodeAssignment {
  const prefix = CODE_PREFIX[locale]
  const roleOfPerson = new Map(profile.people.map((person) => [person.id, person.role]))
  const used = new Set(seed.values())

  // Preferred letters for "My info": the user first, then family in the order entered.
  const personLetter = new Map<string, number>()
  const self = profile.people.find((person) => person.role === 'self')
  if (self) personLetter.set(self.id, 0)
  for (const person of profile.people) {
    if (!personLetter.has(person.id)) personLetter.set(person.id, personLetter.size)
  }
  let nextLetter = personLetter.size
  const nextNumber = new Map<CodeKind, number>()

  // The kind of an identity does not depend on which occurrence comes first: a patient beats a doctor of the same name.
  const kindFor = new Map<string, CodeKind>()
  const firstOf = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const key = identityOf(candidate)
    if (!firstOf.has(key)) firstOf.set(key, candidate)
    const kind = kindOf(candidate, roleOfPerson)
    const current = kindFor.get(key)
    if (!current || (KIND_RANK[kind] ?? 9) < (KIND_RANK[current] ?? 9)) kindFor.set(key, kind)
  }

  const codeOf = new Map<string, string>()
  for (const [key, code] of seed) codeOf.set(key, code)
  for (const [key, candidate] of firstOf) {
    if (codeOf.has(key)) continue
    const kind = kindFor.get(key) as CodeKind
    let code: string
    if (LETTERED.has(kind)) {
      const preferred = candidate.category === 'name' && candidate.personId !== undefined ? personLetter.get(candidate.personId) : undefined
      code = preferred !== undefined ? `${prefix[kind]}${letters(preferred)}` : ''
      while (!code || used.has(code)) code = `${prefix[kind]}${letters(nextLetter++)}`
    } else {
      let next = nextNumber.get(kind) ?? 1
      while (used.has(`${prefix[kind]}${next}`)) next++
      code = `${prefix[kind]}${next}`
      nextNumber.set(kind, next + 1)
    }
    used.add(code)
    codeOf.set(key, code)
  }

  const entries = new Map<string, CodeEntry>()
  const codeFor: Record<string, string> = {}
  for (const candidate of candidates) {
    if ((decisions[candidate.id] ?? candidate.suggestion) !== 'replace') continue
    const key = identityOf(candidate)
    const code = codeOf.get(key) as string
    let entry = entries.get(key)
    if (!entry) {
      entry = { code, identity: key, category: candidate.category, display: candidate.value, values: [],
        ...(candidate.personId && { personId: candidate.personId }) }
      entries.set(key, entry)
    }
    if (!entry.values.includes(candidate.value)) entry.values.push(candidate.value)
    codeFor[candidate.id] = code
  }
  return { book: { entries: [...entries.values()] }, codeFor }
}

/** The code a candidate gets once replaced, for labelling a "Replace with …" button. */
export function previewCodes(candidates: Candidate[], profile: Profile, locale: CodeLocale,
  seed: ReadonlyMap<string, string> = new Map()): Record<string, string> {
  const all: Record<string, Decision> = Object.fromEntries(candidates.map((candidate) => [candidate.id, 'replace' as Decision]))
  return assignCodes(candidates, all, profile, locale, seed).codeFor
}

/** The identity → code map of a code book, used to seed later assignments. */
export function seedOf(book: CodeBook | null | undefined): Map<string, string> {
  return new Map((book?.entries ?? []).map((entry) => [entry.identity, entry.code]))
}

/** A frozen book plus the current one: earlier codes stay restorable after later copies. */
export function mergeBooks(earlier: CodeBook | null | undefined, current: CodeBook): CodeBook {
  const byCode = new Map((earlier?.entries ?? []).map((entry) => [entry.code, entry]))
  for (const entry of current.entries) {
    const before = byCode.get(entry.code)
    byCode.set(entry.code, before ? { ...entry, values: [...new Set([...before.values, ...entry.values])] } : entry)
  }
  return { entries: [...byCode.values()] }
}
