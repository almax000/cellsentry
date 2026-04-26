/**
 * Audit diff viewer — screen 3 (W4 Step 4.1).
 *
 * Spec: `_design/v2/screen-3-redaction-preview.md`. Shows the user the
 * pipeline output: side-by-side original vs redacted, hover popover per
 * replacement showing reason + pattern type, filterable replacement
 * timeline, and export buttons.
 *
 * Span semantics: orchestrator returns Replacement[] with spans relative
 * to each engine's local input/output. The viewer's diff highlighting
 * doesn't depend on byte-perfect spans — it works by chunked-walk over
 * the original text and the redacted text in tandem, recognizing each
 * Replacement's `original` substring as it appears in the original. This
 * is robust to span imprecision while we polish span tracking in W6+.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import './AuditDiffViewer.css'

type Reason = 'mapping' | 'regex' | 'safety_net' | 'date'

interface Replacement {
  original: string
  pseudonym: string
  span: [number, number]
  reason: Reason
  pattern_type?: string
}

interface AuditDiffViewerProps {
  originalText: string
  redactedText: string
  replacements: Replacement[]
  onBack: () => void
  onContinue: () => void
}

export default function AuditDiffViewer({
  originalText,
  redactedText,
  replacements,
  onBack,
  onContinue,
}: AuditDiffViewerProps): JSX.Element {
  const { t } = useTranslation('medical')
  const [activeFilters, setActiveFilters] = useState<Set<Reason>>(
    () => new Set<Reason>(['mapping', 'regex', 'safety_net', 'date']),
  )

  const counts = useMemo<Record<Reason, number>>(() => {
    const c: Record<Reason, number> = { mapping: 0, regex: 0, safety_net: 0, date: 0 }
    for (const r of replacements) c[r.reason]++
    return c
  }, [replacements])

  const filtered = useMemo(
    () => replacements.filter(r => activeFilters.has(r.reason)),
    [replacements, activeFilters],
  )

  const toggleFilter = (reason: Reason): void => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      if (next.has(reason)) next.delete(reason)
      else next.add(reason)
      return next
    })
  }

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(redactedText)
  }

  const handleSaveText = async (): Promise<void> => {
    const dest = await window.api?.openFolderDialog?.()
    if (!dest) return
    // For W4 minimal path we just put the text in clipboard; real .md save
    // via a `medical:export-redacted` IPC is W5 polish. Surface a toast.
    void dest
    await navigator.clipboard.writeText(redactedText)
    alert(t('diff.copyOnlyForNow'))
  }

  return (
    <div className="diff-viewer view-enter">
      <header className="diff-header">
        <h1 className="diff-title">{t('diff.title')}</h1>
        <p className="diff-summary">
          {t('diff.summary', { count: replacements.length })}
        </p>
      </header>

      {/* Filter chips */}
      <div className="diff-filters" role="group" aria-label={t('diff.filterAria')}>
        {(['mapping', 'regex', 'safety_net', 'date'] as Reason[]).map(reason => (
          <button
            key={reason}
            className={`diff-filter diff-filter-${reason} ${activeFilters.has(reason) ? 'active' : ''}`}
            onClick={() => toggleFilter(reason)}
            aria-pressed={activeFilters.has(reason)}
            data-testid={`timeline-filter-${reason}`}
          >
            <span className="diff-filter-dot" /> {t(`diff.filter.${reason}`)} ({counts[reason]})
          </button>
        ))}
      </div>

      {/* Two-pane diff */}
      <div className="diff-panes">
        <DiffPane
          title={t('diff.original')}
          text={originalText}
          replacements={filtered}
          variant="original"
          testid="diff-pane-original"
        />
        <DiffPane
          title={t('diff.redacted')}
          text={redactedText}
          replacements={filtered}
          variant="redacted"
          testid="diff-pane-redacted"
        />
      </div>

      {/* Replacement timeline */}
      <section className="diff-timeline" aria-label={t('diff.timelineAria')}>
        <h2 className="diff-timeline-heading">{t('diff.timelineHeading')}</h2>
        {filtered.length === 0 ? (
          <p className="diff-timeline-empty">{t('diff.timelineEmpty')}</p>
        ) : (
          <ul className="diff-timeline-list">
            {filtered.map((r, i) => (
              <li
                key={i}
                className={`diff-timeline-row diff-row-${r.reason}`}
                data-testid={`timeline-row-${i}`}
              >
                <code className="diff-row-original">{r.original}</code>
                <span className="diff-row-arrow">→</span>
                <code className="diff-row-pseudonym">{r.pseudonym}</code>
                <span className="diff-row-reason">{t(`diff.reason.${r.reason}`)}</span>
                {r.pattern_type && (
                  <span className="diff-row-pattern">{r.pattern_type}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="diff-footer">
        <button className="diff-back" onClick={onBack} data-testid="diff-back">
          {t('diff.back')}
        </button>
        <div className="diff-export-group">
          <button className="diff-export" onClick={handleCopy} data-testid="diff-copy">
            {t('diff.copy')}
          </button>
          <button className="diff-export" onClick={handleSaveText} data-testid="diff-save-md">
            {t('diff.saveMd')}
          </button>
        </div>
        <button className="diff-continue" onClick={onContinue} data-testid="diff-continue">
          {t('diff.continue')}
        </button>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DiffPane — chunked walk over text, highlighting replacement substrings
// ---------------------------------------------------------------------------

interface DiffPaneProps {
  title: string
  text: string
  replacements: Replacement[]
  variant: 'original' | 'redacted'
  testid: string
}

function DiffPane({ title, text, replacements, variant, testid }: DiffPaneProps): JSX.Element {
  const segments = useMemo(() => buildSegments(text, replacements, variant), [text, replacements, variant])

  return (
    <div className="diff-pane" data-testid={testid}>
      <div className="diff-pane-title">{title}</div>
      <div className="diff-pane-body" role="document">
        {segments.map((seg, i) =>
          seg.replacement ? (
            <span
              key={i}
              className={`diff-mark diff-mark-${seg.replacement.reason}`}
              title={`${seg.replacement.original} → ${seg.replacement.pseudonym} (${seg.replacement.reason})`}
              data-testid={`replacement-${variant}-${i}`}
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
    </div>
  )
}

interface Segment {
  text: string
  replacement?: Replacement
}

/**
 * Walk the text left-to-right, splitting at replacement boundaries.
 *
 * For the ORIGINAL pane: highlight each replacement's `original` substring
 * (first un-consumed occurrence per replacement, in order).
 * For the REDACTED pane: highlight each replacement's `pseudonym` substring.
 *
 * This is robust to imperfect spans because we re-scan via indexOf rather
 * than trusting the span integers.
 */
function buildSegments(
  text: string,
  replacements: Replacement[],
  variant: 'original' | 'redacted',
): Segment[] {
  const out: Segment[] = []
  let cursor = 0

  // Build a list of {needle, replacement} ordered by appearance in text.
  const needles: Array<{ needle: string; replacement: Replacement; pos: number }> = []
  let scanFrom = 0
  for (const r of replacements) {
    const needle = variant === 'original' ? r.original : r.pseudonym
    if (!needle) continue
    const idx = text.indexOf(needle, scanFrom)
    if (idx < 0) continue
    needles.push({ needle, replacement: r, pos: idx })
    scanFrom = idx + needle.length
  }
  needles.sort((a, b) => a.pos - b.pos)

  for (const n of needles) {
    if (n.pos > cursor) {
      out.push({ text: text.slice(cursor, n.pos) })
    }
    out.push({ text: n.needle, replacement: n.replacement })
    cursor = n.pos + n.needle.length
  }
  if (cursor < text.length) {
    out.push({ text: text.slice(cursor) })
  }
  return out
}
