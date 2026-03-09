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
  const { scanState, scanMode, fileInfo, progress, isBatch, batchFiles, batchIndex, batchResults } = useScan()
  const [elapsed, setElapsed] = useState(0)
  const [llmAvailable, setLlmAvailable] = useState<boolean | null>(null)
  const startTimeRef = useRef(Date.now())

  // Check LLM status for audit mode
  useEffect(() => {
    if (scanMode !== 'audit') return
    window.api?.getLlmStatus?.()
      .then((status) => setLlmAvailable(status?.available ?? false))
      .catch(() => setLlmAvailable(false))
  }, [scanMode])

  const scanLayers = scanMode === 'pii'
    ? [
        { label: t('patternScanning', { ns: 'pii' }), phase: 'rules' as const },
        { label: t('validation', { ns: 'pii' }), phase: 'enhance' as const },
      ]
    : scanMode === 'extraction'
      ? [
          { label: t('templateMatching', { ns: 'extraction' }), phase: 'rules' as const },
          { label: t('fieldExtraction', { ns: 'extraction' }), phase: 'enhance' as const },
        ]
      : llmAvailable
        ? [
            { label: t('ruleEngineScan'), phase: 'rules' as const },
            { label: t('aiVerification'), phase: 'ai' as const, isAi: true },
          ]
        : [
            { label: t('ruleEngineScan'), phase: 'rules' as const },
          ]

  useEffect(() => {
    startTimeRef.current = Date.now()
    const timer = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current)
    }, 100)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (scanState === 'complete') {
      const resultsPath = scanMode === 'pii' ? '/pii/results'
        : scanMode === 'extraction' ? '/extract/results'
        : '/results'
      const timer = setTimeout(() => navigate(resultsPath), 600)
      return () => clearTimeout(timer)
    }
    if (scanState === 'error') {
      const homePath = scanMode === 'pii' ? '/pii'
        : scanMode === 'extraction' ? '/extract'
        : '/'
      const timer = setTimeout(() => navigate(homePath), 2000)
      return () => clearTimeout(timer)
    }
  }, [scanState, scanMode, navigate])

  // Derive layer state from IPC progress.phase
  const currentPhase = progress.phase || 'rules'

  function getLayerState(layerPhase: string): 'done' | 'active' | 'pending' {
    if (scanState === 'complete') return 'done'

    const phaseOrder = ['rules', 'ai']
    const currentIdx = phaseOrder.indexOf(currentPhase)
    const layerIdx = phaseOrder.indexOf(layerPhase)

    if (layerIdx < currentIdx) return 'done'
    if (layerIdx === currentIdx) {
      return progress.percent >= 100 ? 'done' : 'active'
    }
    return 'pending'
  }

  // Batch mode
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

          {/* Overall batch progress */}
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

          {/* File list */}
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

  // Single file mode
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
            const state = getLayerState(layer.phase)

            let className = 'scan-layer'
            if (state === 'done') className += ' done'
            else if (state === 'active') className += ' active'

            return (
              <div key={i} className={className}>
                <div className="scan-layer-indicator">
                  {state === 'done' ? '✓' : i + 1}
                </div>
                <span>{layer.label}</span>
                <div className="scan-layer-bar">
                  <div
                    className="scan-layer-fill"
                    style={{
                      width: state === 'done' ? '100%' : state === 'active' ? '50%' : '0%',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {llmAvailable === false && scanMode === 'audit' && (
          <div className="scan-ai-badge unavailable">{t('aiUnavailable')}</div>
        )}

        <div className="scan-elapsed" data-testid="scanning-percent">
          {t('elapsed', { time: (elapsed / 1000).toFixed(1) })}
        </div>
      </div>
    </div>
  )
}
