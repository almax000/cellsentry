import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { ExportIcon } from './icons'
import type { AuditExportFormat } from '../../shared/export'
import './ExportButton.css'

export default function ExportButton(): JSX.Element {
  const { t } = useTranslation('results')
  const { results } = useScan()
  const [showDropdown, setShowDropdown] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handleClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDropdown])

  const handleExport = async (format: AuditExportFormat): Promise<void> => {
    if (!results || !window.api?.exportAudit) return

    setExporting(true)
    setShowDropdown(false)
    setFeedback(null)
    try {
      const result = await window.api.exportAudit({
        filePath: results.filePath,
        issues: results.issues,
        fileName: results.fileName,
        format,
      })
      if (result.cancelled) return
      if (result.success) {
        setFeedback({ type: 'success', message: t('exportSavedTo', { path: result.outputPath }) })
      } else {
        setFeedback({ type: 'error', message: result.error || t('exportFailed') })
      }
    } catch {
      setFeedback({ type: 'error', message: t('exportFailed') })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="export-wrapper" ref={ref}>
      <button
        className="btn btn-ghost"
        data-testid="export-btn"
        onClick={() => { setFeedback(null); setShowDropdown(!showDropdown) }}
        disabled={exporting}
      >
        <ExportIcon size={13} /> {exporting ? t('exporting') : t('exportReport')}
      </button>

      {showDropdown && (
        <div className="export-dropdown" data-testid="export-dropdown">
          <div className="export-option" data-testid="export-html" onClick={() => handleExport('html')}>
            {t('htmlReport')}
          </div>
          <div
            className="export-option"
            data-testid="export-pdf"
            onClick={() => handleExport('pdf')}
          >
            {t('pdfReport')}
          </div>
          <div
            className="export-option"
            data-testid="export-xlsx"
            onClick={() => handleExport('xlsx')}
          >
            {t('markedWorkbook')}
          </div>
        </div>
      )}
      {feedback && (
        <div className={`export-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      )}
    </div>
  )
}
