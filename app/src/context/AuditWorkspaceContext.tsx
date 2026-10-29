import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useScan } from './ScanContext'
import { reviewKey, type ReviewDecision } from '../../shared/auditWorkspace'
import type { Issue } from '../types'
import { auditDraftIdentity } from '../utils/auditDraft'

type Decisions = Record<string, ReviewDecision>
type Drafts = Record<string, Decisions>
const STORAGE_KEY = 'cellsentry-audit-reviews-v1'
const EMPTY: Decisions = {}

function readDrafts(): Drafts {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const drafts: Drafts = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const decisions: Decisions = {}
      for (const [finding, decision] of Object.entries(value)) {
        const item = decision as ReviewDecision
        if (item && ['pending', 'confirmed', 'not-applicable'].includes(item.status) && typeof item.note === 'string') {
          decisions[finding] = { status: item.status, note: item.note.slice(0, 4000) }
        }
      }
      drafts[key] = decisions
    }
    return drafts
  } catch { return {} }
}

interface WorkspaceValue {
  decisions: Decisions
  updateDecision: (issue: Issue, decision: Partial<ReviewDecision>) => void
  draftError: boolean
  retrySave: () => void
}
const Context = createContext<WorkspaceValue | null>(null)

export function AuditWorkspaceProvider({ children }: { children: ReactNode }): JSX.Element {
  const { results } = useScan()
  const [drafts, setDrafts] = useState<Drafts>(readDrafts)
  const [draftError, setDraftError] = useState(false)
  const edited = useRef(false)
  // A source-content fingerprint prevents applying decisions to a changed file.
  // Legacy results without one are isolated to this individual scan.
  const identity = useMemo(() => auditDraftIdentity(results), [results])
  const decisions = drafts[identity] || EMPTY
  const save = (): void => {
    if (!edited.current) return
    try {
      // Preserve an unreadable prior draft rather than replacing it with an empty cache.
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) throw new Error('Unreadable draft')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)); setDraftError(false)
    }
    catch { setDraftError(true) }
  }
  useEffect(save, [drafts])
  const updateDecision = (issue: Issue, patch: Partial<ReviewDecision>): void => {
    if (!identity) return
    edited.current = true
    setDrafts(previous => {
      const key = reviewKey(issue)
      const existing: ReviewDecision = previous[identity]?.[key] || { status: 'pending', note: '' }
      const updated = { ...previous, [identity]: { ...previous[identity], [key]: { ...existing, ...patch } } }
      return updated
    })
  }
  return <Context.Provider value={{ decisions, updateDecision, draftError, retrySave: save }}>{children}</Context.Provider>
}

export function useAuditWorkspace(): WorkspaceValue {
  const value = useContext(Context)
  if (!value) throw new Error('AuditWorkspaceProvider is missing')
  return value
}
