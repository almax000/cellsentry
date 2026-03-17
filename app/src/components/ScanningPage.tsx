import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { ShieldIcon, CheckIcon, AlertIcon } from './icons'
import { formatFileSize } from '../utils/format'
import './ScanningPage.css'

export default function ScanningPage(): JSX.Element {
  const { t } = useTranslation('scanning')
  const navigate = useNavigate()
  const {
    scanState, fileInfo, progress, error,
    isBatch, batchFiles, batchIndex, batchResults,
    results, piiResults, extractionResults,
    auditError, piiError, extractionError,
    enginesComplete,
  } = useScan()
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(Date.now())

  const scanLayers = [
    { label: t('ruleEngineScan'), engine: 'audit' as const },
    { label: t('piiDetection', { defaultValue: 'PII Detection' }), engine: 'pii' as const },
    { label: t('dataExtraction', { defaultValue: 'Data Extraction' }), engine: 'extraction' as const },
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
    if (scanState === 'complete') {
      const timer = setTimeout(() => navigate('/results'), 400)
      return () => clearTimeout(timer)
    }
    if (scanState === 'error') {
      const timer = setTimeout(() => navigate('/'), 8000)
      return () => clearTimeout(timer)
    }
  }, [scanState, navigate])

  function getEngineState(engine: 'audit' | 'pii' | 'extraction'): 'done' | 'error' | 'active' {
    if (engine === 'audit') {
      if (auditError) return 'error'
      if (results) return 'done'
    } else if (engine === 'pii') {
      if (piiError) return 'error'
      if (piiResults) return 'done'
    } else {
      if (extractionError) return 'error'
      if (extractionResults) return 'done'
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
                      width: state === 'done' || state === 'error' ? '100%' : '50%',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="scan-elapsed" data-testid="scanning-percent">
          {enginesComplete > 0 && enginesComplete < 3
            ? t('enginesProgress', { done: enginesComplete, total: 3, defaultValue: `${enginesComplete}/3 complete` })
            : t('elapsed', { time: (elapsed / 1000).toFixed(1) })}
        </div>

        {scanState === 'error' && (error || auditError || piiError || extractionError) && (
          <div style={{ marginTop: 16, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 12, maxWidth: 400, wordBreak: 'break-all' }}>
            {error || [auditError, piiError, extractionError].filter(Boolean).join(' | ')}
          </div>
        )}
      </div>
    </div>
  )
}
