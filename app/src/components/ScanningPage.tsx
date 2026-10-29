import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { ShieldIcon, CheckIcon, AlertIcon } from './icons'
import { formatFileSize } from '../utils/format'
import './ScanningPage.css'
import { AuditReviewProgressNotice } from './AuditReviewNotice'

export default function ScanningPage(): JSX.Element {
  const { t } = useTranslation('scanning')
  const navigate = useNavigate()
  const {
    scanState, fileInfo, progress, error, stopRetryRequired,
    isBatch, batchFiles, batchIndex, batchResults,
    results, auditError,
    cancelScan,
  } = useScan()
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(Date.now())

  // CellSentry has one workbook audit task.
  const scanLayers = [
    { label: t('ruleEngineScan'), engine: 'audit' as const },
  ]

  useEffect(() => {
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current)
    }, 100)
    return () => clearInterval(timer)
  }, [])

  // Navigate to results as soon as scan completes (first engine delivers results)
  useEffect(() => {
    if (scanState === 'complete' || (!isBatch && results)) {
      const timer = setTimeout(() => navigate('/results'), 400)
      return () => clearTimeout(timer)
    }
    if (scanState === 'error' && !stopRetryRequired) {
      const timer = setTimeout(() => navigate('/'), 8000)
      return () => clearTimeout(timer)
    }
    if (scanState === 'idle') navigate('/')
  }, [scanState, stopRetryRequired, navigate, results, isBatch])

  function getEngineState(engine: 'audit' | 'pii' | 'extraction'): 'done' | 'error' | 'active' {
    if (engine === 'audit') {
      if (auditError) return 'error'
      if (results) return 'done'
    }
    return 'active'
  }

  // Batch mode (unchanged)
  if (isBatch && batchFiles.length > 1) {
    const totalFiles = batchFiles.length
    const completedFiles = batchFiles.filter(
      (f) => f.status === 'complete' || f.status === 'error'
    ).length
    const currentFile = batchIndex >= 0 && batchIndex < totalFiles ? batchFiles[batchIndex] : null
    const overallPercent = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0
    const totalIssues = batchResults?.aggregateSummary.total || 0

    return (
      <div className="scan-container view-enter">
        <div className="scan-visual">
          <div className="scan-ring" />
          <div className="scan-center-icon">
            <ShieldIcon size={28} />
          </div>
        </div>

        <div className="scan-info">
          <div className="scan-title">
            {t('scanningBatch', { current: completedFiles + 1, total: totalFiles })}
          </div>
          {currentFile && (
            <div className="scan-subtitle">{currentFile.name}</div>
          )}

          <div className="batch-progress">
            <div className="batch-progress-bar">
              <div
                className="batch-progress-fill"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="batch-progress-stats">
              <span>{t('batchComplete', { completed: completedFiles, total: totalFiles })}</span>
              {totalIssues > 0 && <span>{t('issuesFound', { count: totalIssues })}</span>}
            </div>
          </div>

          <div className="batch-file-list">
            {batchFiles.map((file, i) => (
              <div
                key={file.path}
                className={`batch-file-item ${file.status}`}
              >
                <div className="batch-file-indicator">
                  {file.status === 'complete' ? (
                    <CheckIcon size={10} />
                  ) : file.status === 'error' ? (
                    <AlertIcon size={10} />
                  ) : file.status === 'scanning' ? (
                    <div className="batch-file-spinner" />
                  ) : (
                    <span className="batch-file-num">{i + 1}</span>
                  )}
                </div>
                <span className="batch-file-name">{file.name}</span>
                {file.result && (
                  <span className="batch-file-issues">
                    {t('issues', { count: file.result.summary.total })}
                  </span>
                )}
                {file.size > 0 && file.status === 'pending' && (
                  <span className="batch-file-size">{formatFileSize(file.size)}</span>
                )}
              </div>
            ))}
          </div>

          <div className="scan-elapsed">
            {t('elapsed', { time: (elapsed / 1000).toFixed(1) })}
          </div>
          {progress.auditReview && <AuditReviewProgressNotice review={progress.auditReview} />}
          <button className="btn btn-ghost" type="button" onClick={() => void cancelScan()} disabled={scanState === 'cancelling'}>{scanState === 'cancelling' ? t('cancelling') : stopRetryRequired ? t('retryStop') : t('cancel')}</button>
          {stopRetryRequired && <p role="alert">{error}</p>}
        </div>
      </div>
    )
  }

  // Single file — unified 3-engine scan
  const fileName = fileInfo?.fileName || t('analyzing')
  const sheetCount = fileInfo?.sheets?.length || 0
  const cellCount = fileInfo?.totalCells || 0

  return (
    <div className="scan-container view-enter">
      <div className="scan-visual">
        <div className="scan-ring" data-testid="scanning-progress-ring" />
        <div className="scan-center-icon">
          <ShieldIcon size={28} />
        </div>
      </div>

      <div className="scan-info">
        <div className="scan-title">{t('analyzingSpreadsheet')}</div>
        <div className="scan-subtitle" data-testid="scanning-message">
          {fileName}
          {sheetCount > 0 && ` · ${t('sheets', { count: sheetCount })}`}
          {cellCount > 0 && ` · ${t('cells', { count: cellCount.toLocaleString() } as Record<string, unknown>)}`}
        </div>

        <div className="scan-layers" data-testid="scanning-phase">
          {scanLayers.map((layer, i) => {
            const state = getEngineState(layer.engine)

            let className = 'scan-layer'
            if (state === 'done') className += ' done'
            else if (state === 'error') className += ' error'
            else if (state === 'active') className += ' active'

            return (
              <div key={i} className={className}>
                <div className="scan-layer-indicator">
                  {state === 'done' ? '✓' : state === 'error' ? '!' : i + 1}
                </div>
                <span>{layer.label}</span>
                <div className="scan-layer-bar">
                  <div
                    className="scan-layer-fill"
                    style={{
                      width: state === 'done' || state === 'error' ? '100%' : layer.engine === 'audit' && progress.auditReview
                        ? `${progress.auditReview.selected === 0 ? 100 : progress.auditReview.attempted / progress.auditReview.selected * 100}%` : '50%',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {progress.auditReview && <AuditReviewProgressNotice review={progress.auditReview} />}

        <div className="scan-elapsed" data-testid="scanning-percent">
          {t('elapsed', { time: (elapsed / 1000).toFixed(1) })}
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => void cancelScan()} disabled={scanState === 'cancelling'} data-testid="scan-cancel">{scanState === 'cancelling' ? t('cancelling') : stopRetryRequired ? t('retryStop') : t('cancel')}</button>

        {scanState === 'error' && (error || auditError) && (
          <div style={{ marginTop: 16, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 12, maxWidth: 400, overflowWrap: 'anywhere' }}>
            {error || auditError}
          </div>
        )}
      </div>
    </div>
  )
}
