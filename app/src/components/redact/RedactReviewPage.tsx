import { useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { identityOf, previewCodes, seedOf, type Candidate, type Decision } from '../../../shared/redact'
import { useRedact } from '../../redact/RedactContext'
import HighlightedText, { type Highlight } from './HighlightedText'
import RedactSteps from './RedactSteps'
import { maskValue } from './redactFormat'
import { useShareGuard } from './useShareGuard'
import './Redact.css'

interface Group {
  key: string
  ids: string[]
  first: Candidate
  docIds: Set<string>
  fromProfile: boolean
}

/** One group per code: the same identity the code list uses, so a group and its code never disagree. */
const groupKey = identityOf

/**
 * Review: certain findings are grouped and already accepted; uncertain ones
 * get a card with three choices. The preview shows the replaced text by
 * default, since that is safer on a shared or recorded screen.
 */
export default function RedactReviewPage(): JSX.Element {
  const { t } = useTranslation('redact')
  const navigate = useNavigate()
  const { stage, docs, candidates, decisions, reviewed, profile, locale, assignment, outputs, frozen, residue, setDecision, markShared } = useRedact()
  const [view, setView] = useState<'replaced' | 'original'>('replaced')
  const [copyBlocked, setCopyBlocked] = useState(false)
  // The replaced preview is the shareable text page by page, so copying it by hand follows the share page's rules.
  const previewRef = useRef<HTMLDivElement>(null)
  const blocked = residue.length > 0
  useShareGuard(previewRef, { blocked, active: view === 'replaced', onBlocked: () => setCopyBlocked(true), onShared: markShared })
  const [pageKey, setPageKey] = useState<string>(() => (docs[0] ? `${docs[0].id}:${docs[0].pages[0]?.page ?? 1}` : ''))

  // Codes each candidate would get if replaced, for the "Replace with …" button label.
  const preview = useMemo(() => previewCodes(candidates, profile, locale, seedOf(frozen?.book)), [candidates, profile, locale, frozen])

  const { groups, unsure } = useMemo(() => {
    const byKey = new Map<string, Group>()
    const uncertain: Candidate[] = []
    for (const candidate of candidates) {
      if (candidate.certainty === 'unsure') {
        uncertain.push(candidate)
        continue
      }
      const key = groupKey(candidate)
      const group = byKey.get(key) ?? { key, ids: [], first: candidate, docIds: new Set<string>(), fromProfile: false }
      group.ids.push(candidate.id)
      group.docIds.add(candidate.docId)
      group.fromProfile ||= candidate.source === 'profile'
      byKey.set(key, group)
    }
    return { groups: [...byKey.values()], unsure: uncertain }
  }, [candidates])

  if (stage !== 'ready') return <Navigate to="/pii" replace />

  const docName = (docId: string): string => docs.find((doc) => doc.id === docId)?.name ?? ''
  // A few characters on each side, so 张伟 inside 张伟华 is visible on the card.
  const contextOf = (candidate: Candidate): { before: string; after: string } => {
    const text = docs.find((item) => item.id === candidate.docId)?.pages.find((item) => item.page === candidate.page)?.text ?? ''
    const line = (value: string): string => value.replace(/\s+/g, ' ')
    return { before: line(text.slice(Math.max(0, candidate.start - 10), candidate.start)), after: line(text.slice(candidate.end, candidate.end + 10)) }
  }
  const pending = unsure.filter((candidate) => !reviewed[candidate.id]).length
  const sureCount = candidates.length - unsure.length
  const [docId, pageText] = pageKey.split(':')
  const pageNumber = Number(pageText)
  const doc = docs.find((item) => item.id === docId) ?? docs[0]
  const page = doc?.pages.find((item) => item.page === pageNumber) ?? doc?.pages[0]
  const output = outputs.find((item) => item.docId === doc?.id && item.page === page?.page)

  const originalHighlights: Highlight[] = candidates
    .filter((candidate) => candidate.docId === doc?.id && candidate.page === page?.page)
    .map((candidate) => ({ start: candidate.start, end: candidate.end, className: `redact-mark ${decisions[candidate.id]}`, title: t(`reasons.${candidate.reason}`) }))
  const replacedHighlights: Highlight[] = (output?.spans ?? []).map((span) => ({ start: span.start, end: span.end, className: 'redact-mark code' }))

  const renderGroup = (group: Group): JSX.Element => {
    const decision = decisions[group.first.id]
    const code = assignment.codeFor[group.first.id]
    // Some spots in the group were decided one by one on their own cards.
    const mixed = group.ids.some((id) => decisions[id] !== decision)
    return (
      <li key={group.key} className="redact-group" data-testid="redact-group" data-decision={mixed ? 'mixed' : decision}>
        <span className="redact-group-value">{maskValue(group.first.category, group.first.value)}</span>
        <span className="redact-group-arrow" aria-hidden="true">→</span>
        <span className={decision === 'replace' ? 'redact-code' : 'redact-kept'}>{decision === 'replace' ? code : t('review.kept')}</span>
        <span className="redact-group-count">
          {t('review.times', { count: group.ids.length })}
          {group.docIds.size > 1 ? ` · ${t('review.files', { count: group.docIds.size })}` : ''}
          {mixed ? ` · ${t('review.mixed')}` : ''}
        </span>
        <button type="button" className="redact-link" onClick={() => setDecision(group.ids, decision === 'replace' ? 'keep' : 'replace')}>
          {decision === 'replace' ? t('review.groupKeep') : t('review.groupReplace')}
        </button>
      </li>
    )
  }

  const fromProfile = groups.filter((group) => group.fromProfile)
  const fromRules = groups.filter((group) => !group.fromProfile)

  return (
    <div className="redact-page view-enter" data-testid="redact-review">
      <RedactSteps current="review" />
      <div className="redact-review-grid">
        <section className="redact-review-list">
          <header className="redact-review-head">
            <h2 data-testid="redact-review-title">{candidates.length > 0 ? t('review.title', { count: candidates.length }) : t('review.none')}</h2>
            <p className="redact-note">
              {candidates.length === 0
                ? t('review.noneHint')
                : pending > 0 ? t('review.summary', { sure: sureCount, pending }) : t('review.summaryDone', { sure: sureCount })}
            </p>
          </header>

          {fromProfile.length > 0 && (
            <div className="redact-section">
              <h3>{t('review.fromMyInfo')}</h3>
              <ul className="redact-groups">{fromProfile.map(renderGroup)}</ul>
            </div>
          )}
          {fromRules.length > 0 && (
            <div className="redact-section">
              <h3>{t('review.fromRules')}</h3>
              <ul className="redact-groups">{fromRules.map(renderGroup)}</ul>
            </div>
          )}
          {unsure.length > 0 && (
            <div className="redact-section">
              <h3>{t('review.unsure', { count: unsure.length })}</h3>
              <ul className="redact-cards">
                {unsure.map((candidate) => {
                  const decision = decisions[candidate.id]
                  const code = assignment.codeFor[candidate.id] ?? preview[candidate.id]
                  const choice = (value: Decision, label: string, testId: string): JSX.Element => (
                    <button type="button" className={`redact-choice${decision === value ? ' selected' : ''}`} aria-pressed={decision === value}
                      onClick={() => setDecision([candidate.id], value)} data-testid={testId}>
                      {label}
                    </button>
                  )
                  const around = contextOf(candidate)
                  return (
                    <li key={candidate.id} className={`redact-unsure${reviewed[candidate.id] ? ' reviewed' : ''}`} data-testid="redact-unsure">
                      <div className="redact-unsure-head">
                        <span className="redact-unsure-label">{candidate.label ? `${candidate.label}：` : `${t(`categories.${candidate.category}`)}：`}</span>
                        <span className="redact-unsure-value">{candidate.value}</span>
                      </div>
                      <p className="redact-unsure-context" data-testid="redact-unsure-context">
                        …{around.before}<mark className="redact-mark">{candidate.value}</mark>{around.after}…
                      </p>
                      <button type="button" className="redact-unsure-where redact-link"
                        onClick={() => setPageKey(`${candidate.docId}:${candidate.page}`)}>
                        {t(`reasons.${candidate.reason}`)} · {t('review.where', { file: docName(candidate.docId), page: candidate.page })}
                      </button>
                      <div className="redact-choices">
                        {choice('replace', code ? t('review.replaceWith', { code }) : t('review.replaceGeneric'), 'redact-choice-replace')}
                        {choice('keep', t('review.keep'), 'redact-choice-keep')}
                        {choice('not_pii', t('review.notPii'), 'redact-choice-not-pii')}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="redact-preview" data-testid="redact-preview">
          <div className="redact-preview-bar">
            <select aria-label={t('review.previewPick')} value={`${doc?.id}:${page?.page}`} onChange={(event) => setPageKey(event.target.value)}>
              {docs.flatMap((item) => item.pages.map((itemPage) => (
                <option key={`${item.id}:${itemPage.page}`} value={`${item.id}:${itemPage.page}`}>
                  {t('review.previewOf', { file: item.name, page: itemPage.page, pages: item.pages.length })}
                </option>
              )))}
            </select>
            <div className="redact-segmented" role="group">
              <button type="button" className={view === 'replaced' ? 'active' : ''} aria-pressed={view === 'replaced'}
                onClick={() => setView('replaced')} data-testid="redact-view-replaced">{t('review.replaced')}</button>
              <button type="button" className={view === 'original' ? 'active' : ''} aria-pressed={view === 'original'}
                onClick={() => setView('original')} data-testid="redact-view-original">{t('review.original')}</button>
            </div>
          </div>
          <div ref={previewRef} className={view === 'replaced' && blocked ? 'redact-noselect' : undefined}>
            {view === 'replaced'
              ? <HighlightedText className="redact-text" text={output?.text ?? ''} highlights={replacedHighlights} testId="redact-preview-text" />
              : <HighlightedText className="redact-text" text={page?.text ?? ''} highlights={originalHighlights} testId="redact-preview-text" />}
          </div>
          {view === 'replaced' && blocked && copyBlocked && (
            <p className="redact-alert" role="alert" data-testid="redact-review-copy-blocked">{t('review.copyBlocked')}</p>
          )}
        </section>
      </div>

      <footer className="redact-footer">
        {pending > 0 && <p className="redact-note">{t('review.pending', { count: pending })}</p>}
        <div className="redact-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/pii')} data-testid="redact-review-back">{t('review.back')}</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/redact/share')} data-testid="redact-review-next">
            {t('review.next')}
          </button>
        </div>
      </footer>
    </div>
  )
}
