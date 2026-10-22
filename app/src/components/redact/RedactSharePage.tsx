import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRedact } from '../../redact/RedactContext'
import HighlightedText from './HighlightedText'
import RedactSteps from './RedactSteps'
import { maskValue } from './redactFormat'
import { useShareGuard } from './useShareGuard'
import './Redact.css'

/** The shareable version, the leftover check, and the local-only code list. */
export default function RedactSharePage(): JSX.Element {
  const { t } = useTranslation('redact')
  const navigate = useNavigate()
  const {
    stage, docs, share, residue, assignment, profile, replaceLeftovers, resolveLeftover, copyShare, saveShare, markShared, shareChanged,
  } = useRedact()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'canceled' | 'failed'>('idle')
  const [selectionBlocked, setSelectionBlocked] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  const blocked = residue.length > 0
  useShareGuard(textRef, { blocked, onBlocked: () => setSelectionBlocked(true), onShared: markShared })

  if (stage !== 'ready') return <Navigate to="/pii" replace />

  // The sample question only makes sense with a person's code.
  const exampleCode = assignment.book.entries.find((entry) => entry.category === 'name')?.code ?? ''

  // Names and addresses are only found directly when "My info" has them.
  const myInfoHasNames = profile.people.some((person) => (person.name ?? '').trim() !== '' || (person.address ?? '').trim() !== '')

  const copy = async (): Promise<void> => {
    if (blocked) return
    setCopyState((await copyShare()) ? 'copied' : 'failed')
  }
  const save = async (): Promise<void> => {
    if (blocked) return
    setSaveState(await saveShare())
  }

  return (
    <div className="redact-page view-enter" data-testid="redact-share">
      <RedactSteps current="share" />
      <div className="redact-share-grid">
        <section className="redact-card redact-share-text">
          <header className="redact-share-head">
            <h2>{t('share.title')}</h2>
            <span className="redact-note">{t('share.meta', { count: docs.length, chars: share.text.length.toLocaleString() })}</span>
          </header>
          {/* While leftovers remain the text cannot even be selected, so no route (Services, drag) can take it. */}
          <div ref={textRef} className={blocked ? 'redact-noselect' : undefined}>
            <HighlightedText className="redact-text" text={share.text}
              highlights={[
                ...share.spans.map((span) => ({ start: span.start, end: span.end, className: 'redact-mark code' })),
                ...residue.map((hit) => ({ start: hit.start, end: hit.end, className: 'redact-mark residue' })),
              ].sort((a, b) => a.start - b.start)}
              testId="redact-share-text" />
          </div>
          {blocked && selectionBlocked && (
            <p className="redact-alert" role="alert" data-testid="redact-copy-blocked">{t('share.copyBlocked')}</p>
          )}
          <div className="redact-actions">
            <button type="button" className="btn btn-primary" disabled={blocked} onClick={() => void copy()} data-testid="redact-copy">
              {copyState === 'copied' ? t('share.copied') : copyState === 'failed' ? t('share.copyFailed') : t('share.copy')}
            </button>
            <button type="button" className="btn btn-secondary" disabled={blocked} onClick={() => void save()} data-testid="redact-save">
              {saveState === 'saved' ? t('share.saved') : saveState === 'failed' ? t('share.saveFailed') : t('share.save')}
            </button>
            <span className="redact-note">{t('share.codesHint')}</span>
          </div>
        </section>

        <aside className="redact-share-side">
          {shareChanged && <p className="redact-alert" role="status" data-testid="redact-share-changed">{t('share.changed')}</p>}
          <section className={`redact-residue ${blocked ? 'bad' : 'ok'}`} data-testid="redact-residue" data-count={residue.length}>
            <h3>{blocked ? t('share.residueBad', { count: residue.length }) : t('share.residueOk')}</h3>
            <p>{blocked ? t('share.residueBadHint') : t('share.residueOkHint')}</p>
            {!blocked && !myInfoHasNames && <p className="redact-residue-tip" data-testid="redact-fill-my-info">{t('share.fillMyInfo')}</p>}
            {blocked && (
              <>
                <ul className="redact-residue-list">
                  {residue.map((hit, index) => (
                    <li key={`${hit.start}-${index}`} data-testid="redact-residue-hit">
                      <span className="redact-residue-value">{hit.value}</span>
                      <span>{t(`share.residueKinds.${hit.kind}`, { category: t(`categories.${hit.category}`) })}</span>
                      <span className="redact-residue-actions">
                        <button type="button" className="redact-link" onClick={() => resolveLeftover(hit, 'replace')} data-testid="redact-residue-replace">
                          {t('share.hitReplace')}
                        </button>
                        <button type="button" className="redact-link" onClick={() => resolveLeftover(hit, 'not_pii')} data-testid="redact-residue-not-pii">
                          {t('share.hitNotPii')}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="redact-actions">
                  <button type="button" className="btn btn-primary" onClick={replaceLeftovers} data-testid="redact-replace-leftovers">
                    {t('share.replaceLeftovers')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => navigate('/redact/review')}>{t('share.fixReview')}</button>
                </div>
              </>
            )}
          </section>

          <section className="redact-card">
            <h3>{t('share.howTitle')}</h3>
            <ol className="redact-how">
              <li>{t('share.how1')}</li>
              {exampleCode && <li>{t('share.how2', { code: exampleCode })}</li>}
              <li>{t('share.how3')}</li>
            </ol>
          </section>

          <section className="redact-card" data-testid="redact-codebook">
            <h3>{t('share.tableTitle')}</h3>
            {assignment.book.entries.length === 0 ? <p className="redact-note">{t('share.tableEmpty')}</p> : (
              <dl className="redact-codebook">
                {assignment.book.entries.map((entry) => (
                  <div key={entry.code}>
                    <dt className="redact-code">{entry.code}</dt>
                    <dd>{maskValue(entry.category, entry.display)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="redact-note">{t('share.tableHint')}</p>
          </section>
        </aside>
      </div>
      <footer className="redact-footer">
        <div className="redact-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/redact/review')}>{t('share.back')}</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/redact/restore')} data-testid="redact-share-next">
            {t('share.next')}
          </button>
        </div>
      </footer>
    </div>
  )
}
