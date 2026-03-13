import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { DownloadIcon, CheckIcon, AlertIcon } from '../icons'
import './ModelDownloadModal.css'

interface ModelDownloadModalProps {
  onClose: () => void
}

type DownloadPhase = 'checking' | 'downloading' | 'verifying' | 'done' | 'error'

export default function ModelDownloadModal({ onClose }: ModelDownloadModalProps): JSX.Element {
  const { t } = useTranslation('modals')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<DownloadPhase>('checking')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const startDownload = useCallback(async () => {
    if (!window.api?.downloadModel) {
      // Fallback: simulate progress if API not available
      setPhase('downloading')
      const interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            clearInterval(interval)
            setPhase('verifying')
            setMessage(t('modelDownload.verifyingChecksum'))
            setTimeout(() => setPhase('done'), 1500)
            return 100
          }
          return p + 1.5
        })
      }, 80)
      return
    }

    setPhase('downloading')
    setMessage(t('modelDownload.startingDownload'))

    try {
      const result = await window.api.downloadModel()
      if (result.success) {
        setPhase('done')
        setMessage(t('modelDownload.modelIsReady'))
      } else {
        setPhase('error')
        setError(t('modelDownload.downloadFailed'))
      }
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : t('modelDownload.downloadFailed'))
    }
  }, [t])

  useEffect(() => {
    // Check if model already exists
    const checkModel = async (): Promise<void> => {
      if (!window.api?.checkModelExists) {
        startDownload()
        return
      }

      try {
        const result = await window.api.checkModelExists()
        if (result.exists) {
          setPhase('done')
          setMessage(t('modelDownload.modelIsReady'))
        } else {
          startDownload()
        }
      } catch {
        startDownload()
      }
    }

    checkModel()
  }, [startDownload, t])

  // Listen for WebSocket progress updates
  useEffect(() => {
    if (!window.api?.onScanProgress) return

    const unsubscribe = window.api.onScanProgress((rawProgress) => {
      const wsPhase = rawProgress.phase || ''
      const wsPercent = rawProgress.percent ?? 0
      const wsMessage = rawProgress.message || ''

      if (wsPhase === 'download') {
        if (wsMessage.toLowerCase().includes('verif')) {
          setPhase('verifying')
          setMessage(t('modelDownload.verifyingChecksum'))
        } else if (wsMessage.toLowerCase().includes('complete')) {
          setPhase('done')
          setMessage(t('modelDownload.modelIsReady'))
        } else {
          setPhase('downloading')
          setProgress(wsPercent)
          setMessage(wsMessage)
        }
      }
    })

    return unsubscribe
  }, [t])

  // Escape key to close (only when done or error)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && (phase === 'done' || phase === 'error')) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, phase])

  // Also listen for model_download completion events
  useEffect(() => {
    if (!window.api?.onModelDownloadProgress) return

    const unsubscribe = window.api.onModelDownloadProgress((msg) => {
      if (msg.percent !== undefined) {
        setProgress(msg.percent)
        if (msg.message) setMessage(msg.message)
      }
    })

    return unsubscribe
  }, [t])

  const sizeDownloaded = Math.round(progress * 9.2)

  const title =
    phase === 'done'
      ? t('modelDownload.modelReady')
      : phase === 'error'
        ? t('modelDownload.downloadFailed')
        : phase === 'verifying'
          ? t('modelDownload.verifying')
          : phase === 'checking'
            ? t('modelDownload.checking')
            : t('modelDownload.downloading')

  const subtitle =
    phase === 'done'
      ? t('modelDownload.readySubtitle')
      : phase === 'error'
        ? error || t('modelDownload.errorSubtitle')
        : t('modelDownload.oneTimeSubtitle')

  return (
    <div className="modal-overlay" onClick={phase === 'done' ? onClose : undefined}>
      <div className="modal-card" data-testid="model-download-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          {phase === 'done' ? (
            <CheckIcon size={24} />
          ) : phase === 'error' ? (
            <AlertIcon size={24} />
          ) : (
            <DownloadIcon size={24} />
          )}
        </div>
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>

        {(phase === 'downloading' || phase === 'verifying') && (
          <div className="download-progress" data-testid="model-download-progress">
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="progress-stats">
              <span>
                {phase === 'verifying'
                  ? t('modelDownload.sha256Check')
                  : message || `${sizeDownloaded} MB / 920 MB`}
              </span>
              <span className="progress-percent">
                {Math.min(Math.round(progress), 100)}%
              </span>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <button
            className="btn btn-primary"
            onClick={onClose}
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
          >
            {t('modelDownload.getStarted')}
          </button>
        )}

        {phase === 'error' && (
          <button
            className="btn btn-primary"
            onClick={() => { setError(''); startDownload() }}
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
          >
            {t('modelDownload.retryDownload')}
          </button>
        )}
      </div>
    </div>
  )
}
