/**
 * Types for the document redaction flow: read files, find personal
 * information, replace it with consistent codes, check the shareable text for
 * leftovers, and restore the AI's answer. Everything runs on this device.
 */

/** What kind of personal information a span is. */
export type PiiCategory =
  | 'name'
  | 'phone'
  | 'id_number'
  | 'social_security'
  | 'bank_card'
  | 'email'
  | 'address'
  | 'record_number'

/** Who a name belongs to, as far as the field label tells us. */
export type NameRole = 'patient' | 'family' | 'doctor' | 'other'

/** Where a candidate came from. `model` is reserved for a pluggable on-device model. */
export type CandidateSource = 'profile' | 'rule' | 'label' | 'model'

/** "Sure" findings are grouped and pre-accepted; "unsure" ones are shown one by one. */
export type Certainty = 'sure' | 'unsure'

/** The user's choice for one candidate. */
export type Decision = 'replace' | 'keep' | 'not_pii'

/** Stable reason codes, translated in the UI. */
export type CandidateReason =
  | 'profile_match'
  | 'id_checksum'
  | 'id_under_label'
  | 'id_shape'
  | 'mobile_phone'
  | 'landline_phone'
  | 'phone_under_label'
  | 'email'
  | 'bank_card_under_label'
  | 'bank_card_luhn'
  | 'social_security_label'
  | 'record_label'
  | 'name_label'
  | 'family_label'
  | 'doctor_label'
  | 'address_label'
  | 'address_in_text'
  | 'model'
  | 'leftover'
  | 'same_value'

export interface SourcePage {
  /** 1-based page number; pasted text is page 1. */
  page: number
  text: string
  source: 'text' | 'ocr' | 'paste'
}

export interface SourceDocument {
  id: string
  /** Shown only on this device; never copied into the shareable text. */
  name: string
  kind: 'pdf' | 'image' | 'text'
  pages: SourcePage[]
}

/** One person in "My info". Only stored on this device. */
export interface ProfilePerson {
  id: string
  /** The user is `self`; everyone else they add is `family`. */
  role: 'self' | 'family'
  /** Free text such as 妈妈, shown only on this device. */
  relation?: string
  name?: string
  idNumber?: string
  phone?: string
  address?: string
  socialSecurity?: string
}

export interface Profile {
  people: ProfilePerson[]
}

/** A detector's proposal, before ids and decisions are attached. */
export interface DraftCandidate {
  docId: string
  page: number
  /** UTF-16 offsets into the page text; `end` is exclusive. */
  start: number
  end: number
  category: PiiCategory
  source: CandidateSource
  certainty: Certainty
  reason: CandidateReason
  suggestion: Decision
  personId?: string
  role?: NameRole
  /** The field label in front of the value, when there is one. */
  label?: string
  /** For a shorter copy found again for a longer value (the street address of an address in running text): that value, whose code it shares. */
  sameAs?: string
}

export interface Candidate extends DraftCandidate {
  id: string
  value: string
}

/** A code and every original spelling it replaces. Lives only in memory. */
export interface CodeEntry {
  code: string
  /** Who or what the code stands for (see identityOf); stable across re-detection. */
  identity: string
  category: PiiCategory
  /** The first spelling seen; restoring an answer uses this one. */
  display: string
  /** Every spelling seen in the documents, for the leftover check. */
  values: string[]
  personId?: string
}

export interface CodeBook {
  entries: CodeEntry[]
}

export type CodeLocale = 'zh' | 'en'
