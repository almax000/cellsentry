/**
 * CollisionWarningPanel — pre-flight gate per AD3 (W3 Step 3.6).
 *
 * Spec: `_design/v2/screen-2-collision-warning.md`. Renders when scanForCollisions
 * returns non-empty. Pipeline is BLOCKED until user resolves every flag (or
 * cancels).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface CollisionWarning {
  longer: string
  shorter: string
  contexts: string[]
}

type Resolution = 'add' | 'approve' | 'skip' | null

interface CollisionWarningPanelProps {
  collisions: CollisionWarning[]
  onCancel: () => void
  onContinue: () => void
}

export default function CollisionWarningPanel({
  collisions,
  onCancel,
  onContinue,
}: CollisionWarningPanelProps): JSX.Element {
  const { t } = useTranslation('medical')
  const [resolutions, setResolutions] = useState<Resolution[]>(
    () => collisions.map(() => null),
  )

  const unresolved = resolutions.filter(r => r === null).length
  const allResolved = unresolved === 0

  const setResolution = (index: number, resolution: Resolution): void => {
    setResolutions(prev => prev.map((r, i) => (i === index ? resolution : r)))
  }

  return (
    <div
      className="collision-overlay"
      role="dialog"
      aria-labelledby="collision-title"
      aria-describedby="collision-summary"
      data-testid="collision-panel"
    >
      <div className="collision-panel">
        <header className="collision-header">
          <h2 id="collision-title" className="collision-title">
            ⚠ {t('collision.title')}
          </h2>
          <p id="collision-summary" className="collision-summary">
            {t('collision.summary', { count: collisions.length })}
          </p>
        </header>

        <ul className="collision-list">
          {collisions.map((c, i) => (
            <li
              key={`${c.longer}|${c.shorter}|${i}`}
              className={`collision-card resolution-${resolutions[i] ?? 'unresolved'}`}
              data-testid={`collision-card-${i}`}
              role="group"
              aria-labelledby={`collision-${i}-heading`}
            >
              <div className="collision-card-heading" id={`collision-${i}-heading`}>
                {t('collision.cardHeading', { shorter: c.shorter })}
              </div>

              <div className="collision-context">
                <span className="collision-found-label">{t('collision.foundIn')}</span>
                {c.contexts.map((ctx, j) => (
                  <div key={j} className="collision-context-line">
                    {highlightMatch(ctx, c.shorter)}
                  </div>
                ))}
              </div>

              <p className="collision-explain">
                {t('collision.explain', { longer: c.longer, shorter: c.shorter })}
              </p>

              <div className="collision-actions" role="radiogroup" aria-label={t('collision.actionsAria')}>
                <button
                  className="collision-action collision-action-add"
                  data-testid={`collision-action-add-${i}`}
                  aria-pressed={resolutions[i] === 'add'}
                  onClick={() => setResolution(i, 'add')}
                >
                  {t('collision.actions.add', { longer: c.longer })}
                </button>
                <button
                  className="collision-action collision-action-approve"
                  data-testid={`collision-action-approve-${i}`}
                  aria-pressed={resolutions[i] === 'approve'}
                  onClick={() => setResolution(i, 'approve')}
                >
                  {t('collision.actions.approve', { shorter: c.shorter })}
                </button>
                <button
                  className="collision-action collision-action-skip"
                  data-testid={`collision-action-skip-${i}`}
                  aria-pressed={resolutions[i] === 'skip'}
                  onClick={() => setResolution(i, 'skip')}
                >
                  {t('collision.actions.skip')}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <footer className="collision-footer">
          <button
            className="collision-cancel"
            onClick={onCancel}
            data-testid="collision-cancel"
          >
            {t('collision.cancel')}
          </button>
          <button
            className="collision-continue"
            onClick={onContinue}
            disabled={!allResolved}
            aria-disabled={!allResolved}
            aria-label={
              allResolved
                ? t('collision.continueReady')
                : t('collision.continueWithCount', { unresolved })
            }
            data-testid="collision-continue"
          >
            {allResolved
              ? t('collision.continueReady')
              : t('collision.continueWithCount', { unresolved })}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Wrap the matched substring in <mark> for screen-reader highlighting. */
function highlightMatch(context: string, needle: string): JSX.Element {
  const idx = context.indexOf(needle)
  if (idx < 0) return <>{context}</>
  return (
    <>
      {context.slice(0, idx)}
      <mark>{context.slice(idx, idx + needle.length)}</mark>
      {context.slice(idx + needle.length)}
    </>
  )
}
