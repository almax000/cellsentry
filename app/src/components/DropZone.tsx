import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import { useTaskStarter, type PickedFile } from '../hooks/useTaskStarter'
import { TASKS, SPREADSHEET_EXTENSIONS, type TaskId } from '../tasks'
import './DropZone.css'

/** Entry page for one task. File drops are handled window-wide by FileDropRouter. */
export default function DropZone({ task }: { task: TaskId }): JSX.Element {
  const { t } = useTranslation('dropzone')
  const [error, setError] = useState('')
  const { status, modelExists, openFileDialog } = useSidecar()
  const startTask = useTaskStarter()
  const { allowsBatch } = TASKS[task]

  const start = useCallback(
    (files: PickedFile[]) => {
      setError('')
      if (files.length === 0) return
      if (status !== 'connected') {
        setError(t('errorNotConnected'))
        return
      }
      startTask(task, files)
    },
    [status, startTask, task, t]
  )

  const handleBrowse = useCallback(async () => {
    const filePath = await openFileDialog()
    if (filePath) start([{ path: filePath, name: filePath.split(/[/\\]/).pop() || filePath, size: 0 }])
  }, [openFileDialog, start])

  const handleBrowseMultiple = useCallback(async () => {
    if (!window.api?.openFilesDialog) return
    const filePaths = await window.api.openFilesDialog()
    if (filePaths && filePaths.length > 0) {
      start(filePaths.map((p) => ({ path: p, name: p.split(/[/\\]/).pop() || p, size: 0 })))
    }
  }, [start])

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
      start(result.files)
    } catch {
      setError(t('errorFolderScan'))
    }
  }, [start, t])

  return (
    <div className="drop-zone-container view-enter" data-testid={`entry-${task}`}>
      <div className="drop-zone" data-testid="dropzone-area" onClick={handleBrowse}>
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
        <div className="drop-zone-title">{t(`tasks.${task}.title`)}</div>
        <div className="drop-zone-subtitle">
          {t(`tasks.${task}.subtitle`).split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </div>
        <span className="drop-zone-browse" data-testid="dropzone-browse-btn">{t('browse')}</span>
        <div className="drop-zone-formats">
          {SPREADSHEET_EXTENSIONS.map((ext) => (
            <span key={ext} className="format-badge">
              {ext}
            </span>
          ))}
        </div>
        {allowsBatch && (
          <div className="drop-zone-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-ghost" data-testid="dropzone-batch-btn" onClick={handleBrowseMultiple}>
              {t('selectMultiple')}
            </button>
            <button className="btn btn-ghost" data-testid="dropzone-folder-btn" onClick={handleBrowseFolder}>
              {t('scanFolder')}
            </button>
          </div>
        )}
      </div>

      {task === 'pii' && <div className="drop-zone-note" data-testid="dropzone-soon">{t('tasks.pii.soon')}</div>}
      {task === 'audit' && !modelExists && (
        <div className="drop-zone-note" data-testid="dropzone-assistant-hint">
          {t('assistantHint')} <Link to="/settings">{t('assistantLink')}</Link>
        </div>
      )}
      {error && <div className="drop-zone-error" data-testid="dropzone-error">{error}</div>}
    </div>
  )
}
