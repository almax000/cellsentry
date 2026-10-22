/**
 * State of one redaction round: the files, what was found, the user's
 * choices, and the AI's answer. It lives only in memory; quitting the app
 * forgets the code list, as the share page tells the user. "My info" is the
 * one thing saved, encrypted, by the main process.
 *
 * Once the shareable text is copied or saved, its code list is frozen and the
 * restore step uses that copy, so later changes cannot make a code the AI
 * already saw point at someone else. Later codes are handed out around the
 * frozen ones, and a second copy adds to the frozen list instead of replacing
 * it. The code language is fixed per round.
 *
 * Only choices the user made by hand count as decisions: a default "keep" is
 * still checked for leftovers, and re-detecting after "My info" changes keeps
 * hand-made choices only.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  applyCodes, assignCodes, buildShareText, checkResidue, compareCandidates, findCandidates, initialDecisions, mergeBooks,
  resolveHits, restoreAnswer, seedOf,
  type Candidate, type CodeAssignment, type CodeBook, type CodeLocale, type Decision, type PageOutput, type Profile, type ResidueHit,
  type RestoreResult, type ShareText, type SourceDocument,
} from '../../shared/redact'
import type { ReadErrorCode, ReadFailure, ReadProgressEvent } from '../../shared/redact/ipc'

export interface ReadingFile {
  path: string
  name: string
  kind?: 'pdf' | 'image'
  status: 'queued' | 'reading' | 'done' | 'error'
  page: number
  pages: number
  source?: 'text' | 'ocr'
  errors: Array<{ page?: number; code: ReadErrorCode }>
}

/** `stopping`: the user pressed stop and the files finished so far are on their way back. */
type Stage = 'idle' | 'reading' | 'stopping' | 'read' | 'ready'

/** The code list as it was when the shareable text left the app. */
export interface SharedSnapshot {
  book: CodeBook
  locale: CodeLocale
  text: string
}

interface RedactContextValue {
  stage: Stage
  files: ReadingFile[]
  failure: ReadFailure | null
  docs: SourceDocument[]
  candidates: Candidate[]
  decisions: Record<string, Decision>
  reviewed: Record<string, true>
  profile: Profile
  profilePersisted: boolean
  profileError: 'unreadable' | 'save_failed' | null
  locale: CodeLocale
  answer: string
  frozen: SharedSnapshot | null
  /** True when the shareable text changed after it was copied or saved. */
  shareChanged: boolean
  // Derived from the above
  assignment: CodeAssignment
  outputs: PageOutput[]
  share: ShareText
  residue: ResidueHit[]
  restored: RestoreResult
  // Actions
  startFiles: (files: Array<{ path: string; name: string }>) => void
  startText: (text: string, name: string) => Promise<void>
  cancelRead: () => void
  continueAfterRead: () => Promise<void>
  setDecision: (ids: string[], decision: Decision) => void
  replaceLeftovers: () => void
  resolveLeftover: (hit: ResidueHit, decision: Decision) => void
  /** Copy the shareable text; the code list is frozen only when the copy worked. */
  copyShare: () => Promise<boolean>
  /** Save the shareable text to a file; frozen only when it was saved. */
  saveShare: () => Promise<'saved' | 'canceled' | 'failed'>
  /** Freeze the code list after the user copied part of the text by hand. */
  markShared: () => void
  saveProfile: (profile: Profile) => Promise<boolean>
  setAnswer: (answer: string) => void
  reset: () => void
}

const RedactContext = createContext<RedactContextValue | null>(null)

const EMPTY_PROFILE: Profile = { people: [] }

function newRequestId(): string {
  return `read-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function RedactProvider({ children }: { children: ReactNode }): JSX.Element {
  const { i18n } = useTranslation()
  const locale: CodeLocale = i18n.language?.startsWith('zh') ? 'zh' : 'en'

  const [stage, setStage] = useState<Stage>('idle')
  const [files, setFiles] = useState<ReadingFile[]>([])
  const [failure, setFailure] = useState<ReadFailure | null>(null)
  const [docs, setDocs] = useState<SourceDocument[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [reviewed, setReviewed] = useState<Record<string, true>>({})
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [profilePersisted, setProfilePersisted] = useState(true)
  const [profileError, setProfileError] = useState<'unreadable' | 'save_failed' | null>(null)
  const [answer, setAnswer] = useState('')
  const [frozen, setFrozen] = useState<SharedSnapshot | null>(null)
  const [roundLocale, setRoundLocale] = useState<CodeLocale | null>(null)
  const codeLocale = roundLocale ?? locale
  const requestRef = useRef<string | null>(null)
  const readDocsRef = useRef<SourceDocument[]>([])

  useEffect(() => {
    const api = window.api?.redact
    if (!api) return
    let alive = true
    api.loadProfile().then((result) => {
      if (!alive) return
      setProfile(result.profile)
      setProfilePersisted(result.persisted)
      if (result.error) setProfileError('unreadable')
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const api = window.api?.redact
    if (!api) return undefined
    return api.onReadProgress((event: ReadProgressEvent) => {
      if (event.requestId !== requestRef.current) return
      setFiles((current) => current.map((file, index) => {
        if (index !== event.fileIndex) return file
        switch (event.stage) {
          case 'start': return { ...file, status: 'reading', kind: event.kind ?? file.kind, pages: event.pages ?? file.pages }
          case 'page': return { ...file, status: 'reading', page: event.page ?? file.page, pages: event.pages ?? file.pages, source: event.source ?? file.source }
          case 'error': return { ...file, errors: [...file.errors, { page: event.page, code: event.code ?? 'failed' }] }
          case 'end': return { ...file, status: file.page > 0 ? 'done' : 'error' }
          default: return file
        }
      }))
    })
  }, [])

  // Bumped when a round ends, so a slow detection or read from it cannot land in the next one.
  const roundRef = useRef(0)

  /**
   * Find candidates. With `prior`, keeps the user's hand-made choices and the
   * leftovers they added from the share page (unless detection now finds
   * them itself).
   */
  const detect = useCallback(async (nextDocs: SourceDocument[], who: Profile,
    prior?: { candidates: Candidate[]; decisions: Record<string, Decision>; reviewed: Record<string, true> }) => {
    const round = roundRef.current
    const found = await findCandidates(nextDocs, { profile: who })
    if (round !== roundRef.current) return
    let merged = found
    if (prior) {
      const kept = prior.candidates.filter((old) => old.reason === 'leftover'
        && !found.some((item) => item.docId === old.docId && item.page === old.page && old.start < item.end && item.start < old.end))
      const order = new Map(nextDocs.map((doc, index) => [doc.id, index]))
      merged = [...found, ...kept].sort((a, b) => compareCandidates(a, b, order))
    }
    const fresh = initialDecisions(merged)
    if (prior) {
      for (const id of Object.keys(fresh)) {
        if (prior.reviewed[id] && prior.decisions[id]) fresh[id] = prior.decisions[id]
      }
    }
    setCandidates(merged)
    setDecisions(fresh)
  }, [])

  const clearRound = useCallback(() => {
    roundRef.current++
    const inFlight = requestRef.current
    if (inFlight) void window.api?.redact?.cancelRead(inFlight)
    requestRef.current = null
    readDocsRef.current = []
    setFiles([])
    setFailure(null)
    setDocs([])
    setCandidates([])
    setDecisions({})
    setReviewed({})
    setAnswer('')
    setFrozen(null)
    setRoundLocale(null)
  }, [])

  const startFiles = useCallback((picked: Array<{ path: string; name: string }>) => {
    const api = window.api?.redact
    clearRound()
    if (!api || picked.length === 0) return
    const requestId = newRequestId()
    requestRef.current = requestId
    setRoundLocale(locale)
    setStage('reading')
    setFiles(picked.map((file) => ({ path: file.path, name: file.name, status: 'queued', page: 0, pages: 0, errors: [] })))
    const failAll = (error: ReadFailure): void => {
      setFailure(error)
      setFiles((current) => current.map((file) => (file.status === 'done' ? file : { ...file, status: 'error' })))
      setStage('read')
    }
    api.read(requestId, picked.map((file) => file.path)).then((response) => {
      if (requestRef.current !== requestId) return
      requestRef.current = null
      if (!response.ok) {
        failAll(response.error)
        return
      }
      readDocsRef.current = response.documents
        .filter((doc) => doc.pages.some((page) => page.text.trim() !== ''))
        .map((doc, index) => ({ id: `doc-${index + 1}`, name: doc.name, kind: doc.kind, pages: doc.pages }))
      // Fold in the final per-file outcome, in case progress events were missed.
      setFiles((current) => current.map((file, index) => {
        const doc = response.documents[index]
        if (!doc) return { ...file, status: 'error' }
        const hasText = doc.pages.some((page) => page.text.trim() !== '')
        return {
          ...file,
          kind: doc.kind,
          status: hasText ? 'done' : 'error',
          page: doc.pages.length,
          pages: Math.max(file.pages, doc.pages.length),
          source: doc.pages.some((page) => page.source === 'ocr') ? 'ocr' : file.source ?? 'text',
          errors: doc.errors,
        }
      }))
      if (response.canceled) setFailure('canceled')
      setStage('read')
    }).catch(() => {
      if (requestRef.current !== requestId) return
      requestRef.current = null
      failAll('failed')
    })
  }, [clearRound, locale])

  const continueAfterRead = useCallback(async () => {
    const nextDocs = readDocsRef.current
    setDocs(nextDocs)
    await detect(nextDocs, profile)
    setStage('ready')
  }, [detect, profile])

  const startText = useCallback(async (text: string, name: string) => {
    clearRound()
    setRoundLocale(locale)
    const nextDocs: SourceDocument[] = [{ id: 'doc-1', name, kind: 'text', pages: [{ page: 1, text, source: 'paste' }] }]
    setDocs(nextDocs)
    await detect(nextDocs, profile)
    setStage('ready')
  }, [clearRound, detect, locale, profile])

  // Stopping keeps the files read so far: the main process answers with them.
  const cancelRead = useCallback(() => {
    const requestId = requestRef.current
    if (!requestId) return
    setStage('stopping')
    void window.api?.redact?.cancelRead(requestId)
  }, [])

  const setDecision = useCallback((ids: string[], decision: Decision) => {
    if (ids.length === 0) return
    setDecisions((current) => {
      const next = { ...current }
      for (const id of ids) next[id] = decision
      return next
    })
    setReviewed((current) => {
      const next = { ...current }
      for (const id of ids) next[id] = true
      return next
    })
  }, [])

  const saveProfile = useCallback(async (next: Profile) => {
    setProfile(next)
    const result = await window.api?.redact?.saveProfile(next)
    if (result) setProfilePersisted(result.persisted)
    setProfileError(result && !result.ok ? 'save_failed' : null)
    if (docs.length > 0) await detect(docs, next, { candidates, decisions, reviewed })
    return Boolean(result?.ok)
  }, [candidates, decisions, detect, docs, reviewed])

  const reset = useCallback(() => {
    clearRound()
    setStage('idle')
  }, [clearRound])

  const explicit = useMemo(() => new Set(Object.keys(reviewed)), [reviewed])
  const seed = useMemo(() => seedOf(frozen?.book), [frozen])
  const assignment = useMemo(() => assignCodes(candidates, decisions, profile, codeLocale, seed),
    [candidates, decisions, profile, codeLocale, seed])
  const outputs = useMemo(() => applyCodes(docs, candidates, assignment.codeFor, explicit), [docs, candidates, assignment, explicit])
  const share = useMemo(() => buildShareText(docs, outputs, codeLocale), [docs, outputs, codeLocale])
  // Values replaced in an earlier copy count too: a later "keep" by default must not let them out.
  const residueBook = useMemo(() => mergeBooks(frozen?.book, assignment.book), [assignment, frozen])
  const residue = useMemo(() => checkResidue(share, residueBook, profile), [profile, residueBook, share])
  const restored = useMemo(() => frozen
    ? restoreAnswer(answer, frozen.book, frozen.locale)
    : restoreAnswer(answer, assignment.book, codeLocale), [answer, assignment, codeLocale, frozen])
  const shareChanged = frozen !== null && frozen.text !== share.text

  const addLeftovers = useCallback((hits: ResidueHit[], decision: Decision) => {
    const pageText = (docId: string, page: number): string | undefined =>
      docs.find((doc) => doc.id === docId)?.pages.find((item) => item.page === page)?.text
    const { added, existing, removed } = resolveHits(hits, share, candidates, profile, pageText)
    if (added.length === 0 && existing.length === 0) return
    if (added.length > 0 || removed.length > 0) {
      const gone = new Set(removed)
      const order = new Map(docs.map((doc, index) => [doc.id, index]))
      setCandidates([...candidates.filter((candidate) => !gone.has(candidate.id)), ...added]
        .sort((a, b) => compareCandidates(a, b, order)))
    }
    setDecision([...existing, ...added.map((candidate) => candidate.id)], decision)
  }, [candidates, docs, profile, setDecision, share])
  const replaceLeftovers = useCallback(() => addLeftovers(residue, 'replace'), [addLeftovers, residue])
  const resolveLeftover = useCallback((hit: ResidueHit, decision: Decision) => addLeftovers([hit], decision), [addLeftovers])

  const freeze = useCallback(() => {
    setFrozen((current) => ({ book: mergeBooks(current?.book, assignment.book), locale: codeLocale, text: share.text }))
  }, [assignment, codeLocale, share])
  const copyShare = useCallback(async () => {
    if (residue.length > 0) return false
    const ok = Boolean(await window.api?.redact?.copyText(share.text).catch(() => false))
    if (ok) freeze()
    return ok
  }, [freeze, residue, share])
  const saveShare = useCallback(async (): Promise<'saved' | 'canceled' | 'failed'> => {
    if (residue.length > 0) return 'failed'
    const result = await window.api?.redact?.saveText(share.text).catch(() => null)
    if (result?.ok) {
      freeze()
      return 'saved'
    }
    return result?.canceled ? 'canceled' : 'failed'
  }, [freeze, residue, share])

  const value: RedactContextValue = {
    stage, files, failure, docs, candidates, decisions, reviewed, profile, profilePersisted, profileError, locale: codeLocale, answer,
    frozen, shareChanged, assignment, outputs, share, residue, restored,
    startFiles, startText, cancelRead, continueAfterRead, setDecision, replaceLeftovers, resolveLeftover, copyShare, saveShare,
    markShared: freeze,
    saveProfile, setAnswer, reset,
  }
  return <RedactContext.Provider value={value}>{children}</RedactContext.Provider>
}

export function useRedact(): RedactContextValue {
  const context = useContext(RedactContext)
  if (!context) throw new Error('useRedact must be used inside RedactProvider')
  return context
}
