import { useState, useCallback, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import { useScan } from '../context/ScanContext'
import './DropZone.css'

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

export default function DropZone(): JSX.Element {
  const { t } = useTranslation('dropzone')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { status, openFileDialog } = useSidecar()
  const { startScan, startBatchScan } = useScan()

  const validateFile = (name: string): boolean => {
    const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
    return ALLOWED_EXTENSIONS.includes(ext)
  }

  const handleSingleFile = useCallback(
    async (filePath: string) => {
      setError('')
      if (status !== 'connected') {
        setError(t('errorNotConnected'))
        return
      }
      navigate('/scanning')
      startScan(filePath)
    },
    [status, navigate, startScan, t]
  )

  const handleMultipleFiles = useCallback(
    async (files: Array<{ path: string; name: string; size: number }>) => {
      setError('')
      if (status !== 'connected') {
        setError(t('errorNotConnected'))
        return
      }
      if (files.length === 1) {
        navigate('/scanning')
        startScan(files[0].path)
      } else {
        navigate('/scanning')
        startBatchScan(files)
      }
    },
    [status, navigate, startScan, startBatchScan, t]
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

      const validFiles: Array<{ path: string; name: string; size: number }> = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!validateFile(file.name)) continue
        const filePath = window.api?.getFilePathFromDrop?.(file) ?? ''
        if (filePath) {
          validFiles.push({ path: filePath, name: file.name, size: file.size })
        }
      }

      if (validFiles.length === 0) {
        setError(t('errorNoFiles'))
        return
      }

      handleMultipleFiles(validFiles)
    },
    [handleMultipleFiles, t]
  )

  const handleBrowse = useCallback(async () => {
    const filePath = await openFileDialog()
    if (filePath) {
      handleSingleFile(filePath)
    }
  }, [openFileDialog, handleSingleFile])

  const handleBrowseMultiple = useCallback(async () => {
    if (!window.api?.openFilesDialog) return
    const filePaths = await window.api.openFilesDialog()
    if (filePaths && filePaths.length > 0) {
      const files = filePaths.map((p) => ({
        path: p,
        name: p.split(/[/\\]/).pop() || p,
        size: 0,
      }))
      handleMultipleFiles(files)
    }
  }, [handleMultipleFiles])

  const handleBrowseFolder = useCallback(async () => {
    if (!window.api?.openFolderDialog || !window.api?.scanFolder) return
    const folderPath = await window.api.openFolderDialog()
    if (!folderPath) return

    try {
      const result = await window.api.scanFolder(folderPath)
      if (!result.success || result.total === 0) {
        setError(result.error || t('errorNoFilesInFolder'))
        return
      }
      handleMultipleFiles(result.files)
    } catch {
      setError(t('errorFolderScan'))
    }
  }, [handleMultipleFiles, t])

  return (
    <div className="drop-zone-container view-enter">
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        data-testid="dropzone-area"
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="shield-pulse" />
        </div>
        <div className="drop-zone-title">{t('title')}</div>
        <div className="drop-zone-subtitle">
          {t('subtitle').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </div>
        <span className="drop-zone-browse" data-testid="dropzone-browse-btn">{t('browse')}</span>
        <div className="drop-zone-formats">
          {ALLOWED_EXTENSIONS.map((ext) => (
            <span key={ext} className="format-badge">
              {ext}
            </span>
          ))}
        </div>
        <div className="drop-zone-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-ghost" data-testid="dropzone-batch-btn" onClick={handleBrowseMultiple}>
            {t('selectMultiple')}
          </button>
          <button className="btn btn-ghost" data-testid="dropzone-folder-btn" onClick={handleBrowseFolder}>
            {t('scanFolder')}
          </button>
        </div>
      </div>

      {error && <div className="drop-zone-error" data-testid="dropzone-error">{error}</div>}
    </div>
  )
}
