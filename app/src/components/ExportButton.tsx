import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { ExportIcon } from './icons'
import './ExportButton.css'

export default function ExportButton(): JSX.Element {
  const { t } = useTranslation('results')
  const { results } = useScan()
  const [showDropdown, setShowDropdown] = useState(false)
  const [exporting, setExporting] = useState(false)
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

  const handleExport = async (format: 'html' | 'pdf'): Promise<void> => {
    if (!results || !window.api?.generateReport) return

    setExporting(true)
    setShowDropdown(false)
    try {
      const report = await window.api.generateReport({
        issues: results.issues,
        fileName: results.fileName,
      })

      // Trigger download via blob
      const blob = new Blob([report as string], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${results.fileName || 'report'}-audit.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="export-wrapper" ref={ref}>
      <button
        className="btn btn-ghost"
        data-testid="export-btn"
        onClick={() => setShowDropdown(!showDropdown)}
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
        </div>
      )}
    </div>
  )
}
