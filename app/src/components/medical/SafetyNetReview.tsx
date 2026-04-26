/**
 * Safety-net review — screen 4 (W4 Step 4.2).
 *
 * Spec: `_design/v2/screen-4-safety-net-review.md`. After Qwen2.5-3B has
 * reviewed the redacted output and flagged any names that look like real
 * people but weren't in the user's mapping, the user resolves each flag
 * (add to mapping / replace once / dismiss as false positive / defer).
 * Export button enables when every flag is in a terminal state.
 *
 * Graceful degradation: when the safety-net pass returned `unavailable`
 * (Python bridge offline / model not on disk / etc.), the parent renders
 * the degraded banner inline with a "Skip safety-net" affordance — no
 * SafetyNetReview component to render.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import './SafetyNetReview.css'

interface SafetyNetFlag {
  name: string
  context: string
  confidence: number
  suggested_replacement?: string
}

type Resolution =
  | { kind: 'unresolved' }
  | { kind: 'add_to_mapping'; pseudonym: string }
  | { kind: 'replace_once'; replacement: string }
  | { kind: 'dismissed' }
  | { kind: 'deferred' }

interface SafetyNetReviewProps {
  flags: SafetyNetFlag[]
  onCancel: () => void
  onExport: (resolutions: Array<Resolution & { flag: SafetyNetFlag }>) => void
}

function ConfidenceMeter({ value }: { value: number }): JSX.Element {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 5)
  return (
    <span
      className={`confidence-meter confidence-${filled}`}
      role="img"
      aria-label={`Confidence ${value.toFixed(2)} of 1.0`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`confidence-dot ${i < filled ? 'filled' : ''}`} />
      ))}
    </span>
  )
}

export default function SafetyNetReview({ flags, onCancel, onExport }: SafetyNetReviewProps): JSX.Element {
  const { t } = useTranslation('medical')
  const [resolutions, setResolutions] = useState<Resolution[]>(
    () => flags.map(() => ({ kind: 'unresolved' as const })),
  )
  const [drafts, setDrafts] = useState<Array<{ pseudonym?: string; replacement?: string }>>(
    () => flags.map(f => ({ pseudonym: f.suggested_replacement ?? '' })),
  )

  const unresolved = resolutions.filter(r => r.kind === 'unresolved').length
  const allResolved = unresolved === 0

  const setRes = (i: number, res: Resolution): void => {
    setResolutions(prev => prev.map((r, j) => (j === i ? res : r)))
  }

  const handleExport = (): void => {
    if (!allResolved) return
    onExport(resolutions.map((r, i) => ({ ...r, flag: flags[i] })))
  }

  return (
    <div className="safety-net-review view-enter">
      <header className="sn-header">
        <h1 className="sn-title">{t('safetyNet.title', { count: flags.length })}</h1>
        <p className="sn-subtitle">{t('safetyNet.subtitle')}</p>
      </header>

      <ul className="sn-list">
        {flags.map((flag, i) => {
          const r = resolutions[i]
          const isResolved = r.kind !== 'unresolved'
          return (
            <li
              key={`${flag.name}-${i}`}
              className={`sn-card ${isResolved ? `sn-resolved-${r.kind}` : 'sn-unresolved'}`}
              data-testid={`safety-net-card-${i}`}
              role="group"
            >
              <header className="sn-card-header">
                <span className="sn-card-heading">
                  {t('safetyNet.cardHeading', { name: flag.name })}
                </span>
                <ConfidenceMeter value={flag.confidence} />
              </header>

              <p className="sn-context">
                <span className="sn-context-label">{t('safetyNet.contextLabel')}</span>
                {flag.context}
              </p>

              {!isResolved ? (
                <div className="sn-actions" role="radiogroup">
                  <div className="sn-action-row">
                    <button
                      className="sn-action sn-action-add"
                      data-testid={`safety-net-action-add-${i}`}
                      onClick={() => {
                        const pseudonym = drafts[i].pseudonym ?? flag.suggested_replacement ?? ''
                        if (!pseudonym.trim()) return
                        setRes(i, { kind: 'add_to_mapping', pseudonym })
                      }}
                    >
                      {t('safetyNet.actions.add')}
                    </button>
                    <input
                      type="text"
                      className="sn-input"
                      value={drafts[i].pseudonym ?? ''}
                      placeholder={t('safetyNet.pseudonymPlaceholder')}
                      onChange={(e) =>
                        setDrafts(prev => prev.map((d, j) => (j === i ? { ...d, pseudonym: e.target.value } : d)))
                      }
                      data-testid={`safety-net-add-input-${i}`}
                    />
                  </div>

                  <div className="sn-action-row">
                    <button
                      className="sn-action sn-action-replace"
                      data-testid={`safety-net-action-replace-${i}`}
                      onClick={() => {
                        const replacement = drafts[i].replacement ?? `[${t('safetyNet.maskedPlaceholder')}]`
                        setRes(i, { kind: 'replace_once', replacement })
                      }}
                    >
                      {t('safetyNet.actions.replaceOnce')}
                    </button>
                    <input
                      type="text"
                      className="sn-input"
                      value={drafts[i].replacement ?? ''}
                      placeholder={t('safetyNet.replacementPlaceholder')}
                      onChange={(e) =>
                        setDrafts(prev => prev.map((d, j) => (j === i ? { ...d, replacement: e.target.value } : d)))
                      }
                    />
                  </div>

                  <div className="sn-action-row">
                    <button
                      className="sn-action sn-action-dismiss"
                      data-testid={`safety-net-action-dismiss-${i}`}
                      onClick={() => setRes(i, { kind: 'dismissed' })}
                    >
                      {t('safetyNet.actions.dismiss')}
                    </button>
                    <button
                      className="sn-action sn-action-defer"
                      data-testid={`safety-net-action-defer-${i}`}
                      onClick={() => setRes(i, { kind: 'deferred' })}
                    >
                      {t('safetyNet.actions.defer')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sn-resolved-summary">
                  ✓ {t(`safetyNet.resolved.${r.kind}`)}
                  <button
                    className="sn-undo"
                    onClick={() => setRes(i, { kind: 'unresolved' })}
                    aria-label={t('safetyNet.undoAria')}
                  >
                    {t('safetyNet.undo')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <footer className="sn-footer">
        <button className="sn-cancel" onClick={onCancel} data-testid="safety-net-cancel">
          {t('safetyNet.cancel')}
        </button>
        <button
          className="sn-export"
          onClick={handleExport}
          disabled={!allResolved}
          aria-disabled={!allResolved}
          aria-label={
            allResolved
              ? t('safetyNet.exportReady')
              : t('safetyNet.exportWithCount', { unresolved })
          }
          data-testid="safety-net-export"
        >
          {allResolved
            ? t('safetyNet.exportReady')
            : t('safetyNet.exportWithCount', { unresolved })}
        </button>
      </footer>
    </div>
  )
}
