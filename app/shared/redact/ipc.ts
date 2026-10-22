/** Types shared by the main process and the window for the redaction flow. */
import type { Profile, ProfilePerson, SourcePage } from './types'

export type ReadErrorCode = 'unreadable' | 'encrypted' | 'restricted' | 'too_large' | 'unsupported' | 'ocr_failed' | 'too_many_pages'
  | 'timeout' | 'stopped' | 'too_much_text' | 'needs_ocr' | 'failed'
export type ReadFailure = 'reader_missing' | 'unsupported_platform' | 'canceled' | 'timeout' | 'too_many_files' | 'failed'

/** Progress only: page text never travels in progress events. */
export interface ReadProgressEvent {
  requestId: string
  fileIndex: number
  stage: 'start' | 'page' | 'error' | 'end'
  kind?: 'pdf' | 'image'
  page?: number
  pages?: number
  source?: 'text' | 'ocr'
  code?: ReadErrorCode
}

export interface ReadDocument {
  path: string
  name: string
  kind: 'pdf' | 'image'
  pages: SourcePage[]
  errors: Array<{ page?: number; code: ReadErrorCode }>
}

export type ReadResponse =
  /** `canceled`: the user stopped reading; the files finished before that are included. */
  | { ok: true; documents: ReadDocument[]; canceled?: boolean }
  | { ok: false; error: ReadFailure }

export interface ProfileLoadResult {
  profile: Profile
  /** False when the profile can only live in memory (no secure storage). */
  persisted: boolean
  error?: 'unreadable'
}

export interface ProfileSaveResult {
  ok: boolean
  persisted: boolean
  error?: 'invalid' | 'write_failed'
}

export interface SaveTextResult {
  ok: boolean
  canceled?: boolean
  error?: string
}

export interface RedactAPI {
  loadProfile: () => Promise<ProfileLoadResult>
  saveProfile: (profile: Profile) => Promise<ProfileSaveResult>
  clearProfile: () => Promise<{ ok: boolean }>
  openDocuments: () => Promise<string[] | null>
  read: (requestId: string, paths: string[]) => Promise<ReadResponse>
  cancelRead: (requestId: string) => Promise<void>
  onReadProgress: (callback: (event: ReadProgressEvent) => void) => () => void
  saveText: (text: string) => Promise<SaveTextResult>
  /** False when the text was not copied (too long). */
  copyText: (text: string) => Promise<boolean>
}

const PERSON_FIELDS = ['relation', 'name', 'idNumber', 'phone', 'address', 'socialSecurity'] as const
export const MAX_PEOPLE = 20
/** One read takes at most this many files. */
export const MAX_READ_FILES = 50
const MAX_FIELD = 200

/** Accept only the profile shape we store; anything else is dropped. */
export function sanitizeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Profile).people)) return null
  const people: ProfilePerson[] = []
  for (const raw of (value as Profile).people.slice(0, MAX_PEOPLE)) {
    if (!raw || typeof raw !== 'object') return null
    const id = (raw as ProfilePerson).id
    const role = (raw as ProfilePerson).role
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || (role !== 'self' && role !== 'family')) return null
    const person: ProfilePerson = { id, role }
    for (const key of PERSON_FIELDS) {
      const field = (raw as ProfilePerson)[key]
      if (field === undefined || field === '') continue
      if (typeof field !== 'string' || field.length > MAX_FIELD) return null
      person[key] = field
    }
    people.push(person)
  }
  if (people.filter((person) => person.role === 'self').length > 1) return null
  return { people }
}
