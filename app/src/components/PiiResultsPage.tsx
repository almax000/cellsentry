import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import type { Issue, PiiFinding, PiiType } from '../types'
import { FileSpreadsheetIcon, ShieldCheckIcon } from './icons'
import { formatDuration } from '../utils/format'
import { TASKS } from '../tasks'
import { cellLabel } from '../utils/cellLabel'
import { piiLabelKey } from '../utils/piiLabel'
import SpreadsheetPreview from './SpreadsheetPreview'
import './PiiResultsPage.css'

const PII_TYPE_COLORS: Record<PiiType, string> = {
  ssn: 'var(--danger)',
  phone: 'var(--info)',
  email: '#8b5cf6',
  id_number: 'var(--danger)',
  credit_card: '#ef4444',
  name: '#06b6d4',
  address: '#f59e0b',
  iban: '#ec4899',
  bank_card: '#ef4444',
  passport: '#d946ef',
}

export default function PiiResultsPage(): JSX.Element {
  const { t, i18n } = useTranslation('pii')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()
  const { piiResults, fileInfo, reset } = useScan()

  const findings = piiResults?.findings || []

  const [selectedFinding, setSelectedFinding] = useState<PiiFinding | null>(findings[0] || null)
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(() => new Set(findings.map((finding) => finding.id)))
  const [redactionFeedback, setRedactionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const reviewDialog = useRef<HTMLDialogElement>(null)
  const redactButton = useRef<HTMLButtonElement>(null)
  const redactionInFlight = useRef(false)
  const selectedForRedaction = findings.filter((finding) => selectedFindings.has(finding.id))
  useEffect(() => {
    const dialog = reviewDialog.current
    if (!reviewOpen || !dialog) return
    dialog.showModal()
    return () => { dialog.close(); redactButton.current?.focus() }
  }, [reviewOpen])
  const [isRedacting, setIsRedacting] = useState(false)
  const [panelWidth, setPanelWidth] = useState(340)
  const [isDragging, setIsDragging] = useState(false)
  const dividerRef = useRef<HTMLDivElement>(null)

  // Convert PII findings to Issue-like objects for SpreadsheetPreview
  const previewIssues: Issue[] = useMemo(() => findings.map((f, i) => ({
    id: `pii-${i}`,
    sheetName: f.sheetName,
    cell: f.cell,
    formula: '',
    ruleId: f.piiType,
    severity: 'warning' as const,
    confidence: f.confidence,
    message: `${t(piiLabelKey(f.piiType, f.pattern))}: ${f.maskedValue}`,
    suggestion: '',
    category: 'pii',
    layer: 'rule' as const,
  })), [findings, t])

  const selectedPreviewIssue: Issue | null = useMemo(() => {
    if (!selectedFinding) return null
    const idx = findings.findIndex((finding) => finding.id === selectedFinding.id)
    return previewIssues[idx] ? { ...previewIssues[idx] } : null
  }, [selectedFinding, findings, previewIssues])

  const sheets = useMemo(() => {
    const s = new Set(findings.map((f) => f.sheetName))
    return s.size > 0 ? Array.from(s) : fileInfo?.sheets?.map((sh) => sh.name) || ['Sheet1']
  }, [findings, fileInfo])

  // Group by the same label the cards show, so "手机号" and "美国电话号码" are counted separately.
  const typeSummary = useMemo(() => {
    const groups = new Map<string, { labelKey: string; piiType: PiiType; count: number }>()
    for (const finding of findings) {
      const labelKey = piiLabelKey(finding.piiType, finding.pattern)
      const group = groups.get(labelKey)
      if (group) group.count += 1
      else groups.set(labelKey, { labelKey, piiType: finding.piiType, count: 1 })
    }
    return [...groups.values()].sort((a, b) => b.count - a.count)
  }, [findings])

  const handleFindingClick = useCallback((finding: PiiFinding) => {
    setSelectedFinding({ ...finding })
  }, [])

  const handleToggleSelect = useCallback((findingId: string) => {
    setSelectedFindings((prev) => {
      const next = new Set(prev)
      if (next.has(findingId)) next.delete(findingId)
      else next.add(findingId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedFindings.size === findings.length) {
      setSelectedFindings(new Set())
    } else {
      setSelectedFindings(new Set(findings.map((f) => f.id)))
    }
  }, [findings, selectedFindings.size])

  // PII protection is part of the workbook audit, so rescans return to audit.
  const handleRescan = useCallback(() => {
    reset()
    navigate(TASKS.audit.route)
  }, [reset, navigate])

  const handleRedactAll = useCallback(async () => {
    if (redactionInFlight.current || !piiResults || !window.api?.redactPii) return
    const selected = findings.filter((finding) => selectedFindings.has(finding.id))
    if (selected.length === 0) return
    redactionInFlight.current = true
    setReviewOpen(false)
    setIsRedacting(true)
    setRedactionFeedback(null)
    try {
      const result = await window.api.redactPii({
        filePath: piiResults.filePath,
        fileName: piiResults.fileName,
        findings: selected.map((finding) => ({
          sheetName: finding.sheetName,
          cell: finding.cell,
          piiType: finding.piiType,
          originalValue: finding.originalValue,
          maskedValue: finding.maskedValue,
          pattern: finding.pattern,
        })),
      })
      if (result.cancelled) return
      setRedactionFeedback(result.success
        ? { type: 'success', message: t('redactSavedTo', { path: result.outputPath }) }
        : { type: 'error', message: result.error || t('redactFailed') })
    } catch {
      setRedactionFeedback({ type: 'error', message: t('redactFailed') })
    } finally {
      redactionInFlight.current = false
      setIsRedacting(false)
    }
  }, [selectedFindings, findings, piiResults, t])

  // Resizable divider
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      const startX = e.clientX
      const startWidth = panelWidth

      const handleMouseMove = (ev: MouseEvent): void => {
        const delta = ev.clientX - startX
        setPanelWidth(Math.min(Math.max(startWidth + delta, 280), 600))
      }
      const handleMouseUp = (): void => {
        setIsDragging(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [panelWidth]
  )

  // No findings state
  if (findings.length === 0) {
    return (
      <div className="no-issues-container view-enter">
        <div className="no-issues-icon">
          <ShieldCheckIcon size={40} />
        </div>
        <div className="no-issues-title">{t('noFindings')}</div>
        <div className="no-issues-file">{fileInfo?.fileName || tc('file')}</div>
        <div className="no-issues-detail">
          {t('sheetsAndCells', { sheets: fileInfo?.sheets?.length || 0, cells: fileInfo?.totalCells?.toLocaleString() || 0 })}
          {piiResults?.duration ? ` · ${formatDuration(piiResults.duration)}` : ''}
        </div>
        <div className="no-issues-msg">
          {t('noPiiMsg').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </div>
        <button className="btn btn-primary" onClick={handleRescan} style={{ marginTop: '8px' }}>
          {tc('scanAnother')}
        </button>
      </div>
    )
  }

  return (
    <div className="results-split view-enter">
      {/* Left: PII Findings Panel */}
      <div className="results-panel-left" data-testid="pii-results-panel-left" style={{ width: panelWidth, minWidth: 280 }}>
        <div className="results-top-bar">
          <div className="file-icon-sm">
            <FileSpreadsheetIcon size={16} />
          </div>
          <div className="file-info-compact">
            <div className="file-name">{fileInfo?.fileName || tc('file')}</div>
            <div className="file-detail">
              {t('findingsCount', { count: findings.length })}
              {piiResults?.duration ? ` · ${formatDuration(piiResults.duration)}` : ''}
            </div>
          </div>
          <button className="rescan-btn" data-testid="pii-results-rescan-btn" onClick={handleRescan} title={tc('rescan')}>
            ↻
          </button>
        </div>

        {/* PII type summary row */}
        <div className="pii-type-summary" data-testid="pii-type-summary">
          {typeSummary.map(({ labelKey, piiType, count }) => (
            <span
              key={labelKey}
              className="pii-type-chip"
              style={{ '--chip-color': PII_TYPE_COLORS[piiType] || 'var(--text-muted)' } as React.CSSProperties}
            >
              <span className="pii-type-dot" />
              {t(labelKey)} <strong className="pii-type-count">{count}</strong>
            </span>
          ))}
        </div>

        {/* One reminder for the whole list instead of on every card */}
        <p className="pii-list-hint" data-testid="pii-list-hint">{t('listHint')}</p>

        {/* Select all / Redact controls */}
        <div className="pii-actions-bar">
          <span className="pii-selection-count" data-testid="pii-selection-count">{t('selectedCount', { count: selectedForRedaction.length, total: findings.length })}</span>
          <button
            className="pii-select-btn"
            data-testid="pii-select-all-btn"
            onClick={handleSelectAll}
          >
            {selectedFindings.size === findings.length ? t('deselectAll') : t('selectAll')}
          </button>
        </div>

        {/* Finding list */}
        <div className="pii-finding-list" data-testid="pii-finding-list">
          {findings.map((finding, index) => (
            <div
              key={finding.id}
              className={`pii-finding-card ${selectedFinding?.id === finding.id ? 'selected' : ''}`}
              data-testid={`pii-finding-card-${index}`}
              data-sheet-name={finding.sheetName}
              data-cell-address={finding.cell}
              onClick={() => handleFindingClick(finding)}
            >
              <div className="pii-finding-check" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedFindings.has(finding.id)}
                  onChange={() => handleToggleSelect(finding.id)}
                  aria-label={t('selectFinding', { place: cellLabel(finding.cell, i18n.language, finding.sheetName) })}
                  data-testid={`pii-finding-check-${index}`}
                />
              </div>
              <div className="pii-finding-body">
                <div className="pii-finding-header">
                  <span className="pii-cell-address">{cellLabel(finding.cell, i18n.language, finding.sheetName)}</span>
                  <span
                    className="pii-type-badge"
                    style={{ '--badge-color': PII_TYPE_COLORS[finding.piiType] || 'var(--text-muted)' } as React.CSSProperties}
                  >
                    {t(piiLabelKey(finding.piiType, finding.pattern))}
                  </span>
                </div>
                <div className="pii-finding-value">{finding.maskedValue}</div>
                {finding.pattern === 'ai-detected' && <div className="pii-finding-meta">{t('aiCandidate')}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Redact button */}
        <div className="pii-redact-footer">
          <p className="pii-export-note">{t('copyOnly')}</p>
          <button
            className="btn btn-primary pii-redact-btn"
            data-testid="pii-redact-btn"
            ref={redactButton}
            onClick={() => setReviewOpen(true)}
            disabled={isRedacting || selectedForRedaction.length === 0}
          >
            {isRedacting ? t('redacting') : t('reviewRedaction', { count: selectedForRedaction.length })}
          </button>
          {redactionFeedback && (
            <div className={`pii-export-feedback ${redactionFeedback.type}`} role="status">
              {redactionFeedback.message}
            </div>
          )}
        </div>
      </div>

      {reviewOpen && <dialog ref={reviewDialog} className="pii-review-dialog" aria-labelledby="pii-review-title" onCancel={() => setReviewOpen(false)}>
        <h2 id="pii-review-title">{t('reviewTitle')}</h2>
        <p>{t('reviewScope', { count: selectedForRedaction.length, total: findings.length })}</p>
        <p>{t('copyOnly')}</p>
        <div className="pii-review-table-wrap">
          <table>
            <thead><tr><th>{t('source')}</th><th>{t('original')}</th><th>{t('masked')}</th></tr></thead>
            <tbody>{selectedForRedaction.map((finding) => <tr key={finding.id}>
              <td>{cellLabel(finding.cell, i18n.language, finding.sheetName)}</td><td>{finding.originalValue}</td><td>{finding.maskedValue}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="pii-review-actions">
          <button className="btn btn-ghost" onClick={() => setReviewOpen(false)}>{t('backToSelection')}</button>
          <button className="btn btn-primary" data-testid="pii-confirm-redact-btn" disabled={isRedacting} onClick={handleRedactAll}>{t('saveRedactedCopy')}</button>
        </div>
      </dialog>}

      {/* Resizable Divider */}
      <div
        ref={dividerRef}
        className={`results-divider ${isDragging ? 'active' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {/* Right: Spreadsheet Preview */}
      <div className="results-panel-right" data-testid="pii-results-panel-right">
        <SpreadsheetPreview
          issues={previewIssues}
          selectedIssue={selectedPreviewIssue}
          sheets={sheets}
          filePath={piiResults?.filePath || ''}
        />
      </div>
    </div>
  )
}
