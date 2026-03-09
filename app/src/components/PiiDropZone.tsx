import { useState, useCallback, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import { useScan } from '../context/ScanContext'
import './DropZone.css'

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

export default function PiiDropZone(): JSX.Element {
  const { t } = useTranslation('pii')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { status, openFileDialog } = useSidecar()
  const { startScan } = useScan()

  const validateFile = (name: string): boolean => {
    const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
    return ALLOWED_EXTENSIONS.includes(ext)
  }

  const handleFile = useCallback(
    async (filePath: string) => {
      setError('')
      if (status !== 'connected') {
        setError(t('errorNotConnected', { ns: 'dropzone' }))
        return
      }
      navigate('/pii/scanning')
      startScan(filePath, 'pii')
    },
    [status, navigate, startScan, t]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)

      const files = e.dataTransfer.files
      if (files.length === 0) return

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!validateFile(file.name)) continue
        const filePath = window.api?.getFilePathFromDrop?.(file) ?? ''
        if (filePath) {
          handleFile(filePath)
          return
        }
      }

      setError(t('errorNoFiles', { ns: 'dropzone' }))
    },
    [handleFile, t]
  )

  const handleBrowse = useCallback(async () => {
    const filePath = await openFileDialog()
    if (filePath) {
      handleFile(filePath)
    }
  }, [openFileDialog, handleFile])

  return (
    <div className="drop-zone-container view-enter">
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        data-testid="pii-dropzone-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowse}
      >
        <div className="drop-zone-icon">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
          <div className="shield-pulse" />
        </div>
        <div className="drop-zone-title">{t('dropTitle')}</div>
        <div className="drop-zone-subtitle">
          {t('dropSubtitle').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </div>
        <span className="drop-zone-browse" data-testid="pii-dropzone-browse-btn">{t('browse')}</span>
        <div className="drop-zone-formats">
          {ALLOWED_EXTENSIONS.map((ext) => (
            <span key={ext} className="format-badge">
              {ext}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="drop-zone-error" data-testid="pii-dropzone-error">{error}</div>}
    </div>
  )
}
