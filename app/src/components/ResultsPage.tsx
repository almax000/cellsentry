import { useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import type { Issue, SeverityLevel } from '../types'
import { FileSpreadsheetIcon, ShieldCheckIcon, CheckIcon, AlertIcon } from './icons'
import { formatDuration } from '../utils/format'
import IssueCard from './IssueCard'
import SpreadsheetPreview from './SpreadsheetPreview'
import './ResultsPage.css'

type FilterKey = 'all' | SeverityLevel

export default function AuditResultsPage(): JSX.Element {
  const { t } = useTranslation('results')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()
  const { results, fileInfo, reset, isBatch, batchFiles, batchResults, selectBatchFile } = useScan()

  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(
    results?.issues[0] || null
  )
  const [expandedIssue, setExpandedIssue] = useState<Issue | null>(null)
  const [panelWidth, setPanelWidth] = useState(340)
  const [isDragging, setIsDragging] = useState(false)
  const [activeBatchFileIndex, setActiveBatchFileIndex] = useState(0)
  const dividerRef = useRef<HTMLDivElement>(null)

  const issues = results?.issues || []
  const summary = results?.summary || { errors: 0, warnings: 0, info: 0, total: 0 }

  const filteredIssues = useMemo(() => {
    if (filter === 'all') return issues
    return issues.filter((i) => i.severity === filter)
  }, [issues, filter])

  const avgConfidence = useMemo(() => {
    const valid = issues.filter((i) => typeof i.confidence === 'number' && !isNaN(i.confidence))
    if (valid.length === 0) return 0
    return valid.reduce((sum, i) => sum + i.confidence, 0) / valid.length
  }, [issues])

  const handleIssueClick = useCallback(
    (issue: Issue) => {
      setSelectedIssue(issue)
      setExpandedIssue((prev) => (prev?.id === issue.id ? null : issue))
    },
    []
  )

  const handleRescan = useCallback(() => {
    reset()
    navigate('/')
  }, [reset, navigate])

  const handleBatchFileSelect = useCallback(
    (index: number) => {
      setActiveBatchFileIndex(index)
      selectBatchFile(index)
      setFilter('all')
      setSelectedIssue(null)
      setExpandedIssue(null)
    },
    [selectBatchFile]
  )

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

  // Batch summary stats
  const batchSummary = batchResults?.aggregateSummary

  // No issues state (single file only)
  if (!isBatch && issues.length === 0) {
    return (
      <div className="no-issues-container view-enter">
        <div className="no-issues-icon">
          <ShieldCheckIcon size={40} />
        </div>
        <div className="no-issues-title">{t('allClear')}</div>
        <div className="no-issues-file">{fileInfo?.fileName || tc('file')}</div>
        <div className="no-issues-detail">
          {t('sheetsAndCells', {
            sheets: fileInfo?.sheets?.length || 0,
            cells: fileInfo?.totalCells?.toLocaleString() || 0
          })}
          {results?.duration ? ` · ${t('scannedIn', { duration: formatDuration(results.duration) })}` : ''}
        </div>
        <div className="no-issues-msg">
          {t('noIssuesMsg').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </div>
        <button className="btn btn-primary" onClick={handleRescan} style={{ marginTop: '8px' }}>
          {tc('scanAnother')}
        </button>
      </div>
    )
  }

  const filterItems: [FilterKey, string, number, string | null][] = isBatch && batchSummary
    ? [
        ['all', t('filterAll'), batchSummary.total, null],
        ['error', t('filterCritical'), batchSummary.errors, 'var(--danger)'],
        ['warning', t('filterWarn'), batchSummary.warnings, 'var(--warning)'],
        ['info', t('filterInfo'), batchSummary.info, 'var(--info)'],
      ]
    : [
        ['all', t('filterAll'), issues.length, null],
        ['error', t('filterCritical'), summary.errors, 'var(--danger)'],
        ['warning', t('filterWarn'), summary.warnings, 'var(--warning)'],
        ['info', t('filterInfo'), summary.info, 'var(--info)'],
      ]

  const sheets = fileInfo?.sheets?.map((s) => s.name) || results?.issues?.[0]?.sheetName
    ? [...new Set(results?.issues.map((i) => i.sheetName))]
    : ['Sheet1']

  return (
    <>
      <div className="results-split view-enter">
        {/* Left: Issues Panel */}
        <div className="results-panel-left" data-testid="results-panel-left" style={{ width: panelWidth, minWidth: 280 }}>
          {/* Batch file tabs */}
          {isBatch && batchFiles.length > 1 && (
            <div className="batch-tabs">
              {batchFiles.map((file, i) => {
                const issueCount = file.result?.summary.total || 0
                const hasError = file.status === 'error'
                return (
                  <div
                    key={file.path}
                    className={`batch-tab ${i === activeBatchFileIndex ? 'active' : ''} ${hasError ? 'error' : ''}`}
                    data-testid={`results-batch-tab-${i}`}
                    onClick={() => handleBatchFileSelect(i)}
                    title={file.name}
                  >
                    <span className="batch-tab-icon">
                      {hasError ? (
                        <AlertIcon size={11} />
                      ) : issueCount > 0 ? (
                        <span className="batch-tab-count">{issueCount}</span>
                      ) : (
                        <CheckIcon size={11} />
                      )}
                    </span>
                    <span className="batch-tab-name">{file.name}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="results-top-bar">
            <div className="file-icon-sm">
              <FileSpreadsheetIcon size={16} />
            </div>
            <div className="file-info-compact">
              <div className="file-name">
                {isBatch
                  ? batchFiles[activeBatchFileIndex]?.name || tc('file')
                  : fileInfo?.fileName || tc('file')}
              </div>
              <div className="file-detail">
                {isBatch && batchResults
                  ? t('batchFileDetail', { count: batchFiles.length, issues: batchSummary?.total || 0 })
                  : t('fileDetail', {
                      sheets: sheets.length,
                      sheetSuffix: sheets.length > 1 ? 's' : '',
                      cells: fileInfo?.totalCells?.toLocaleString() || 0,
                      duration: results?.duration ? ` · ${formatDuration(results.duration)}` : ''
                    })}
              </div>
            </div>
            <button className="rescan-btn" data-testid="results-rescan-btn" onClick={handleRescan} title={tc('rescan')}>
              ↻
            </button>
          </div>

          <div className="results-summary-row" data-testid="results-summary">
            <div className="summary-card-mini">
              <div className="label">{t('crit')}</div>
              <div className="value danger">{summary.errors}</div>
            </div>
            <div className="summary-card-mini">
              <div className="label">{t('warn')}</div>
              <div className="value warning">{summary.warnings}</div>
            </div>
            <div className="summary-card-mini">
              <div className="label">{t('info')}</div>
              <div className="value info-color">{summary.info}</div>
            </div>
            <div className="summary-card-mini">
              <div className="label">{t('conf')}</div>
              <div className="value brand">{Math.round(avgConfidence * 100)}%</div>
            </div>
          </div>

          <div className="filter-bar">
            {filterItems.map(([key, label, count, color]) => (
              <div
                key={key}
                className={`filter-chip ${filter === key ? 'active' : ''}`}
                data-testid={`results-filter-${key}`}
                onClick={() => setFilter(key)}
              >
                {color && <span className="filter-dot" style={{ background: color }} />}
                {label} ({count})
              </div>
            ))}
          </div>

          <div className="issue-list">
            {filteredIssues.map((issue, index) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                isSelected={selectedIssue?.id === issue.id}
                isExpanded={expandedIssue?.id === issue.id}
                onClick={() => handleIssueClick(issue)}
                data-testid={`results-issue-card-${index}`}
              />
            ))}
          </div>
        </div>

        {/* Resizable Divider */}
        <div
          ref={dividerRef}
          className={`results-divider ${isDragging ? 'active' : ''}`}
          onMouseDown={handleMouseDown}
        />

        {/* Right: Spreadsheet Preview */}
        <div className="results-panel-right" data-testid="results-panel-right">
          <SpreadsheetPreview
            issues={issues}
            selectedIssue={selectedIssue}
            sheets={sheets}
            filePath={results?.filePath || ''}
          />
        </div>
      </div>
    </>
  )
}
