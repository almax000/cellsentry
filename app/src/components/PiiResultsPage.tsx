import { useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import type { Issue, PiiFinding, PiiType } from '../types'
import { FileSpreadsheetIcon, ShieldCheckIcon } from './icons'
import { formatDuration, formatConfidence } from '../utils/format'
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
  const { t } = useTranslation('pii')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()
  const { piiResults, fileInfo, reset } = useScan()

  const findings = piiResults?.findings || []
  const summary = piiResults?.summary || { total: 0, byType: {} as Record<PiiType, number> }

  const [selectedFinding, setSelectedFinding] = useState<PiiFinding | null>(findings[0] || null)
  const [selectedFindings, setSelectedFindings] = useState<Set<string>>(new Set())
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
    message: `${t(`piiTypes.${f.piiType}`)}: ${f.maskedValue}`,
    suggestion: '',
    category: 'pii',
    layer: 'rule' as const,
  })), [findings, t])

  const selectedPreviewIssue: Issue | null = useMemo(() => {
    if (!selectedFinding) return null
    const idx = findings.indexOf(selectedFinding)
    return previewIssues[idx] || null
  }, [selectedFinding, findings, previewIssues])

  const sheets = useMemo(() => {
    const s = new Set(findings.map((f) => f.sheetName))
    return s.size > 0 ? Array.from(s) : fileInfo?.sheets?.map((sh) => sh.name) || ['Sheet1']
  }, [findings, fileInfo])

  const typeSummary = useMemo(() => {
    const entries = Object.entries(summary.byType) as [PiiType, number][]
    return entries.filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])
  }, [summary.byType])

  const handleFindingClick = useCallback((finding: PiiFinding) => {
    setSelectedFinding(finding)
  }, [])

  const handleToggleSelect = useCallback((e: React.MouseEvent, findingId: string) => {
    e.stopPropagation()
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

  const handleRescan = useCallback(() => {
    reset()
    navigate('/')
  }, [reset, navigate])

  const handleRedactAll = useCallback(() => {
    // Redaction handled by main process
    const ids = selectedFindings.size > 0 ? Array.from(selectedFindings) : findings.map((f) => f.id)
    window.api?.redactPii?.(piiResults?.filePath || '', ids)
  }, [selectedFindings, findings, piiResults])

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
          {fileInfo?.sheets?.length || 0} sheets &middot; {fileInfo?.totalCells?.toLocaleString() || 0} cells
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
          {typeSummary.map(([piiType, count]) => (
            <span
              key={piiType}
              className="pii-type-chip"
              style={{ '--chip-color': PII_TYPE_COLORS[piiType] || 'var(--text-muted)' } as React.CSSProperties}
            >
              <span className="pii-type-dot" />
              {count} {t(`piiTypes.${piiType}`)}
            </span>
          ))}
        </div>

        {/* Select all / Redact controls */}
        <div className="pii-actions-bar">
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
              onClick={() => handleFindingClick(finding)}
            >
              <div className="pii-finding-check" onClick={(e) => handleToggleSelect(e, finding.id)}>
                <input
                  type="checkbox"
                  checked={selectedFindings.has(finding.id)}
                  readOnly
                  data-testid={`pii-finding-check-${index}`}
                />
              </div>
              <div className="pii-finding-body">
                <div className="pii-finding-header">
                  <span className="pii-cell-address">{finding.cell}</span>
                  <span
                    className="pii-type-badge"
                    style={{ '--badge-color': PII_TYPE_COLORS[finding.piiType] || 'var(--text-muted)' } as React.CSSProperties}
                  >
                    {t(`piiTypes.${finding.piiType}`)}
                  </span>
                </div>
                <div className="pii-finding-value">{finding.maskedValue}</div>
                <div className="pii-finding-meta">
                  <span className="pii-confidence-bar">
                    <span className="pii-confidence-fill" style={{ width: `${finding.confidence * 100}%` }} />
                  </span>
                  <span className="pii-confidence-text">{formatConfidence(finding.confidence)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Redact button */}
        <div className="pii-redact-footer">
          <button
            className="btn btn-primary pii-redact-btn"
            data-testid="pii-redact-btn"
            onClick={handleRedactAll}
          >
            {selectedFindings.size > 0
              ? `${t('redactSelected')} (${selectedFindings.size})`
              : t('redact')}
          </button>
        </div>
      </div>

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
