import { useMemo, useState, type KeyboardEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { restoredText } from '../../../shared/redact'
import { useRedact } from '../../redact/RedactContext'
import RedactSteps from './RedactSteps'
import './Redact.css'

/**
 * Paste the AI's answer; codes are swapped back as soon as it is pasted.
 * Every spot can be switched: a restored one back to its code, an ambiguous
 * one (患者A型血) to the original.
 */
export default function RedactRestorePage(): JSX.Element {
  const { t } = useTranslation('redact')
  const navigate = useNavigate()
  const { stage, answer, setAnswer, restored, reset, frozen, shareChanged } = useRedact()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirming, setConfirming] = useState(false)
  // Segment indexes the user switched; a new answer starts over.
  const [flipped, setFlipped] = useState<{ answer: string; spots: ReadonlySet<number> }>({ answer: '', spots: new Set() })
  const spots = flipped.answer === answer ? flipped.spots : new Set<number>()
  const finalText = useMemo(() => restoredText(restored, spots), [restored, spots])

  if (stage !== 'ready') return <Navigate to="/pii" replace />

  const restoredCount = restored.segments.reduce((count, segment, index) => count
    + (segment.restored && !spots.has(index) ? 1 : 0) + (segment.ambiguous && spots.has(index) ? 1 : 0), 0)

  const toggle = (index: number): void => {
    const next = new Set(spots)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setFlipped({ answer, spots: next })
    setCopyState('idle')
  }
  const onKey = (index: number) => (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggle(index)
  }

  const copy = async (): Promise<void> => {
    const ok = Boolean(await window.api?.redact?.copyText(finalText).catch(() => false))
    setCopyState(ok ? 'copied' : 'failed')
  }

  return (
    <div className="redact-page view-enter" data-testid="redact-restore">
      <RedactSteps current="restore" />
      <div className="redact-restore-grid">
        <section className="redact-card">
          <label className="redact-card-title" htmlFor="redact-answer">{t('restore.title')}</label>
          {shareChanged && <p className="redact-alert" role="status" data-testid="redact-restore-changed">{t('restore.changed')}</p>}
          {!frozen && <p className="redact-note" data-testid="redact-restore-not-shared">{t('restore.notShared')}</p>}
          <textarea id="redact-answer" className="redact-answer" value={answer} rows={14} placeholder={t('restore.placeholder')} spellCheck={false}
            onChange={(event) => { setAnswer(event.target.value); setCopyState('idle') }} data-testid="redact-answer" />
        </section>
        <section className="redact-card" data-testid="redact-restored">
          <header className="redact-share-head">
            <h2>{t('restore.result')}</h2>
            {answer && <span className="redact-note" data-testid="redact-restored-count">{t('restore.replaced', { count: restoredCount })}</span>}
          </header>
          {answer ? (
            <pre className="redact-text" data-testid="redact-restored-text">
              {restored.segments.map((segment, index) => {
                const swap = segment.restored ?? segment.ambiguous
                if (!swap) {
                  return segment.unknownCode
                    ? <mark key={index} className="redact-mark unknown" data-testid="redact-seg-unknown">{segment.text}</mark>
                    : <span key={index}>{segment.text}</span>
                }
                const on = segment.restored ? !spots.has(index) : spots.has(index)
                return (
                  <mark key={index} role="button" tabIndex={0} aria-pressed={on}
                    className={`redact-mark ${on ? 'restored' : 'ambiguous'}`}
                    title={on ? t('restore.toCode', { code: swap.code }) : t('restore.toOriginal')}
                    onClick={() => toggle(index)} onKeyDown={onKey(index)}
                    data-testid={segment.restored ? 'redact-seg-restored' : 'redact-seg-ambiguous'} data-on={on}>
                    {on ? swap.original : swap.code}
                  </mark>
                )
              })}
            </pre>
          ) : <p className="redact-note">{t('restore.empty')}</p>}
          {answer && (restored.replaced > 0 || restored.ambiguous > 0) && <p className="redact-note">{t('restore.toggleHint')}</p>}
          {restored.ambiguous > 0 && (
            <p className="redact-alert" role="status" data-testid="redact-ambiguous">{t('restore.ambiguous', { count: restored.ambiguous })}</p>
          )}
          {restored.unknownCodes.length > 0 && (
            <p className="redact-alert" role="status" data-testid="redact-unknown-codes">
              {t('restore.unknown', { codes: restored.unknownCodes.join('、') })}
            </p>
          )}
          <div className="redact-actions">
            <button type="button" className="btn btn-primary" disabled={!answer} onClick={() => void copy()} data-testid="redact-restored-copy">
              {copyState === 'copied' ? t('restore.copied') : copyState === 'failed' ? t('restore.copyFailed') : t('restore.copy')}
            </button>
          </div>
          <p className="redact-note redact-local">{t('restore.local')}</p>
          <p className="redact-note">{t('restore.clipboard')}</p>
        </section>
      </div>
      <footer className="redact-footer">
        {confirming && <p className="redact-alert" role="alert">{t('restore.startOverConfirm')}</p>}
        <div className="redact-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/redact/share')}>{t('restore.back')}</button>
          {confirming ? (
            <button type="button" className="btn btn-secondary" onClick={() => { reset(); navigate('/pii') }} data-testid="redact-start-over-yes">
              {t('restore.startOverYes')}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)} data-testid="redact-start-over">
              {t('restore.startOver')}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
