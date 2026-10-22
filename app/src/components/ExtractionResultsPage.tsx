import { useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import type { Issue, ExtractionField, ExtractedTable, DocumentType } from '../types'
import { FileSpreadsheetIcon, ShieldCheckIcon } from './icons'
import { formatDuration } from '../utils/format'
import { TASKS } from '../tasks'
import { cellLabel } from '../utils/cellLabel'
import SpreadsheetPreview from './SpreadsheetPreview'
import './ExtractionResultsPage.css'

const DOC_TYPE_COLORS: Record<DocumentType, string> = {
  invoice: 'var(--brand)',
  receipt: 'var(--success)',
  expense_report: 'var(--warning)',
  purchase_order: 'var(--info)',
  payroll: '#8b5cf6',
  unknown: 'var(--text-muted)',
}

export default function ExtractionResultsPage(): JSX.Element {
  const { t, i18n } = useTranslation('extraction')
  const { t: tc } = useTranslation('common')
  const navigate = useNavigate()
  const { extractionResults, fileInfo, reset } = useScan()

  const fields = extractionResults?.fields || []
  const tables = extractionResults?.tables || []
  const docType = extractionResults?.documentType || 'unknown'

  const [selectedField, setSelectedField] = useState<ExtractionField | null>(fields[0] || null)
  const [selectedTable, setSelectedTable] = useState<ExtractedTable | null>(null)
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [panelWidth, setPanelWidth] = useState(340)
  const [isDragging, setIsDragging] = useState(false)
  const dividerRef = useRef<HTMLDivElement>(null)

  // Known template keys get a translated label; unknown keys (e.g. from AI)
  // keep the label the extractor reported.
  const fieldLabel = useCallback((field: ExtractionField): string => {
    const key = `fieldLabels.${field.key}`
    return /^[a-z][a-z0-9_]*$/.test(field.key) && i18n.exists(key, { ns: 'extraction' }) ? t(key) : field.label
  }, [t, i18n])

  // Convert extraction fields to Issue-like objects for SpreadsheetPreview
  const previewIssues: Issue[] = useMemo(() => fields.map((f, i) => ({
    id: `ext-${i}`,
    sheetName: f.sheetName,
    cell: f.cell,
    formula: '',
    ruleId: f.key,
    severity: 'info' as const,
    confidence: f.confidence,
    message: `${fieldLabel(f)}: ${f.value}`,
    suggestion: '',
    category: 'extraction',
    layer: 'rule' as const,
  })), [fields, fieldLabel])

  const selectedPreviewIssue: Issue | null = useMemo(() => {
    if (selectedField) {
      const idx = fields.findIndex((field) => (
        field.key === selectedField.key
        && field.sheetName === selectedField.sheetName
        && field.cell === selectedField.cell
      ))
      return previewIssues[idx] ? { ...previewIssues[idx] } : null
    }
    if (!selectedTable) return null
    return {
      id: `table-${selectedTable.sheetName}-${selectedTable.startCell}`,
      sheetName: selectedTable.sheetName,
      cell: selectedTable.startCell,
      formula: '',
      ruleId: 'table_range',
      severity: 'info',
      confidence: 0,
      message: t('continuousRangeNotice', { range: `${selectedTable.startCell}:${selectedTable.endCell}` }),
      suggestion: '',
      category: 'extraction',
      layer: 'rule',
    }
  }, [selectedField, selectedTable, fields, previewIssues, t])

  const sheets = useMemo(() => {
    const names: string[] = []
    for (const f of fields) {
      if (!names.includes(f.sheetName)) names.push(f.sheetName)
    }
    for (const tbl of tables) {
      if (!names.includes(tbl.sheetName)) names.push(tbl.sheetName)
    }
    return names.length > 0 ? names : fileInfo?.sheets?.map((sh) => sh.name) || ['Sheet1']
  }, [fields, tables, fileInfo])

  const handleFieldClick = useCallback((field: ExtractionField) => {
    setSelectedField({ ...field })
    setSelectedTable(null)
  }, [])

  const handleTableClick = useCallback((table: ExtractedTable) => {
    setSelectedTable({ ...table })
    setSelectedField(null)
  }, [])

  // Back to this task's entry page, not the home page.
  const handleRescan = useCallback(() => {
    reset()
    navigate(TASKS.extraction.route)
  }, [reset, navigate])

  const handleExport = useCallback(async (format: 'json' | 'csv') => {
    if (!extractionResults || !window.api?.exportExtraction) return
    setExporting(true)
    setExportFeedback(null)
    try {
      const result = await window.api.exportExtraction({
        filePath: extractionResults.filePath,
        fileName: extractionResults.fileName,
        format,
        fields,
        tables,
      })
      if (result.cancelled) return
      setExportFeedback(result.success
        ? { type: 'success', message: t('exportSavedTo', { path: result.outputPath }) }
        : { type: 'error', message: result.error || t('exportFailed') })
    } catch {
      setExportFeedback({ type: 'error', message: t('exportFailed') })
    } finally {
      setExporting(false)
    }
  }, [extractionResults, fields, tables, t])

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

  // No data extracted state
  if (fields.length === 0 && tables.length === 0) {
    return (
      <div className="no-issues-container view-enter">
        <div className="no-issues-icon">
          <ShieldCheckIcon size={40} />
        </div>
        <div className="no-issues-title">{t('noFields')}</div>
        <div className="no-issues-file">{fileInfo?.fileName || tc('file')}</div>
        <div className="no-issues-detail">
          {t('sheetsAndCells', { sheets: fileInfo?.sheets?.length || 0, cells: fileInfo?.totalCells?.toLocaleString() || 0 })}
          {extractionResults?.duration ? ` · ${formatDuration(extractionResults.duration)}` : ''}
        </div>
        <div className="no-issues-msg">
          {t('noFieldsMsg').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </div>
        <button className="btn btn-primary" onClick={handleRescan} style={{ marginTop: '8px' }}>
          {tc('scanAnother')}
        </button>
      </div>
    )
  }

  const docTypeColor = DOC_TYPE_COLORS[docType] || DOC_TYPE_COLORS.unknown

  return (
    <div className="results-split view-enter">
      {/* Left: Extraction Panel */}
      <div className="results-panel-left" data-testid="extraction-results-panel-left" style={{ width: panelWidth, minWidth: 280 }}>
        <div className="results-top-bar">
          <div className="file-icon-sm">
            <FileSpreadsheetIcon size={16} />
          </div>
          <div className="file-info-compact">
            <div className="file-name">{fileInfo?.fileName || tc('file')}</div>
            <div className="file-detail">
              {t('extractedFields', { count: fields.length })}
              {tables.length > 0 ? ` · ${t('extractedTables', { count: tables.length })}` : ''}
              {extractionResults?.duration ? ` · ${formatDuration(extractionResults.duration)}` : ''}
            </div>
          </div>
          <button className="rescan-btn" data-testid="extraction-results-rescan-btn" onClick={handleRescan} title={tc('rescan')}>
            ↻
          </button>
        </div>

        {/* Document type badge */}
        <div className="ext-doc-type-row" data-testid="extraction-doc-type">
          <div
            className="ext-doc-type-badge"
            style={{ '--doc-type-color': docTypeColor } as React.CSSProperties}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{t(`documentTypes.${docType}`)}</span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="results-summary-row">
          <div className="summary-card-mini">
            <div className="label">{t('fields')}</div>
            <div className="value brand">{fields.length}</div>
          </div>
          <div className="summary-card-mini">
            <div className="label">{t('tables')}</div>
            <div className="value info-color">{tables.length}</div>
          </div>
        </div>

        {/* Field list */}
        <div className="ext-section-label">{t('fields')}</div>
        <div className="ext-field-list" data-testid="extraction-field-list">
          {fields.map((field, index) => (
            <div
              key={`${field.key}-${index}`}
              className={`ext-field-card ${selectedField?.key === field.key && selectedField?.sheetName === field.sheetName && selectedField?.cell === field.cell ? 'selected' : ''}`}
              data-testid={`extraction-field-card-${index}`}
              data-field-key={field.key}
              data-sheet-name={field.sheetName}
              data-cell-address={field.cell}
              onClick={() => handleFieldClick(field)}
              title={t('inspectSourceCell', { place: cellLabel(field.cell, i18n.language, field.sheetName) })}
            >
              <div className="ext-field-header">
                <span className="ext-field-label">{fieldLabel(field)}</span>
              </div>
              <div className="ext-field-value">{field.value}</div>
              <div className="ext-field-source">
                <span>{t('sourceCell')}</span>
                <span className="ext-field-place">{cellLabel(field.cell, i18n.language, field.sheetName)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Table indicators */}
        {tables.length > 0 && (
          <>
            <div className="ext-section-label">{t('tables')}</div>
            <div className="ext-table-list">
              {tables.map((table, index) => (
                <div
                  key={index}
                  className={`ext-table-card ${selectedTable?.sheetName === table.sheetName && selectedTable?.startCell === table.startCell && selectedTable?.endCell === table.endCell ? 'selected' : ''}`}
                  data-testid={`extraction-table-card-${index}`}
                  onClick={() => handleTableClick(table)}
                  title={t('inspectRange', { range: `${table.startCell}:${table.endCell}` })}
                >
                  <div className="ext-table-header">
                    <span className="ext-table-sheet">{table.sheetName}</span>
                    <span className="ext-table-range" title={t('exportedRange', { range: `${table.startCell}:${table.endCell}` })}>{table.startCell}:{table.endCell}</span>
                  </div>
                  <div className="ext-table-detail">
                    {t('tableShape', { columns: table.headers.length, rows: table.rows.length })}
                  </div>
                  <div className="ext-table-headers" title={table.headers.join(', ')}>
                    {table.headers.join(' · ')}
                  </div>
                  <p className="ext-table-caution">
                    {t('continuousRangeNotice', { range: `${table.startCell}:${table.endCell}` })}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Export buttons */}
        <div className="ext-export-footer">
          <button
            className="btn btn-primary ext-export-btn"
            data-testid="extraction-export-json-btn"
            onClick={() => handleExport('json')}
            disabled={exporting}
          >
            {t('exportJson')}
          </button>
          <button
            className="btn btn-ghost ext-export-btn"
            data-testid="extraction-export-csv-btn"
            onClick={() => handleExport('csv')}
            disabled={exporting}
          >
            {t('exportCsv')}
          </button>
          {exportFeedback && (
            <div className={`ext-export-feedback ${exportFeedback.type}`} role="status">
              {exportFeedback.message}
            </div>
          )}
        </div>
      </div>

      {/* Resizable Divider */}
      <div
        ref={dividerRef}
        className={`results-divider ${isDragging ? 'active' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {/* Right: Spreadsheet Preview */}
      <div className="results-panel-right" data-testid="extraction-results-panel-right">
        <SpreadsheetPreview
          issues={previewIssues}
          selectedIssue={selectedPreviewIssue}
          sheets={sheets}
          filePath={extractionResults?.filePath || ''}
        />
      </div>
    </div>
  )
}
