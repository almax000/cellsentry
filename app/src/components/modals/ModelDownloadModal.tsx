import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelDownloadFailureReason } from '../../../shared/modelDownload'
import { DownloadIcon, CheckIcon, AlertIcon } from '../icons'
import { formatByteSize, formatExactBytes } from '../../utils/byteSize'
import { FORMULA_ASSISTANT_MODEL } from '../../utils/formulaAssistant'
import './ModelDownloadModal.css'

const MODEL_SIZE = formatByteSize(FORMULA_ASSISTANT_MODEL.sizeBytes)
// Main-process import errors are technical English; show a plain sentence and
// keep the raw message in the technical details.
const IMPORT_MISMATCH = /size mismatch|sha256 mismatch/i

interface ModelDownloadModalProps { onClose: () => void; forceDownload?: boolean }
type DownloadPhase = 'ready' | 'downloading' | 'importing' | 'loading' | 'done' | 'error'

export default function ModelDownloadModal({ onClose, forceDownload = false }: ModelDownloadModalProps): JSX.Element {
  const { t } = useTranslation('modals')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<DownloadPhase>('ready')
  const [installed, setInstalled] = useState(false)
  const [downloadAvailable, setDownloadAvailable] = useState(false)
  const [error, setError] = useState('')
  const [failureReason, setFailureReason] = useState<ModelDownloadFailureReason | null>(null)
  const [modelName, setModelName] = useState('')
  const active = useRef(true)
  const operation = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    active.current = true
    let disposed = false
    void window.api.getModelStatus().then(status => {
      if (!disposed) {
        setModelName(status.name)
        setDownloadAvailable(status.downloadAvailable === true)
      }
      if (!disposed && !busy.current) {
        setInstalled(status.exists)
        if (status.loaded && !forceDownload) setPhase('done')
      }
    }).catch(() => { /* explicit setup actions remain available */ })
    const unsubscribe = window.api.onModelDownloadProgress(event => {
      if (!disposed && active.current && event.percent !== undefined) setProgress(event.percent)
    })
    return () => {
      disposed = true
      active.current = false
      operation.current += 1
      unsubscribe()
      void window.api.cancelModelDownload()
    }
  }, [forceDownload])

  const close = (): void => {
    active.current = false
    operation.current += 1
    void window.api.cancelModelDownload()
    onClose()
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  async function prepare(source: 'download' | 'import' | 'installed'): Promise<void> {
    if (busy.current) return
    busy.current = true
    const id = ++operation.current
    const current = (): boolean => active.current && operation.current === id
    setError('')
    setFailureReason(null)
    setProgress(0)
    setPhase(source === 'download' ? 'downloading' : source === 'import' ? 'importing' : 'loading')
    try {
      if (source === 'import') {
        const result = await window.api.importModel()
        if (!current()) return
        if (result.cancelled) { setPhase('ready'); return }
        if (!result.success) throw new Error(result.error || t('modelDownload.importFailed'))
      } else if (source === 'download') {
        const result = await window.api.downloadModel()
        if (!current()) return
        if (!result.success) {
          setFailureReason(result.failureReason || 'other')
          throw new Error(t('modelDownload.downloadFailed'))
        }
      }
      if (!current()) return
      setInstalled(true)
      setPhase('loading')
      const status = await window.api.startLlm()
      if (!current()) return
      if (!status.modelLoaded) throw new Error(status.error || t('modelDownload.loadFailed'))
      setPhase('done')
    } catch (err) {
      if (current()) {
        setPhase('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally { if (current()) busy.current = false }
  }

  const titleKey = phase === 'done' ? 'modelReady' : phase === 'error' ? 'setupFailed'
    : phase === 'loading' ? 'loadingModel' : phase === 'importing' ? 'verifying'
      : phase === 'downloading' ? 'downloading' : 'prepareModel'
  const title = t(`modelDownload.${titleKey}`)
  const displayError = IMPORT_MISMATCH.test(error) ? t('modelDownload.importWrongFile') : error
  const guidanceKey = failureReason ? `modelDownload.failureGuidance.${failureReason}` : null
  const preferImport = !downloadAvailable || (phase === 'error' && (failureReason === 'access_denied' || failureReason === 'source_unavailable' || failureReason === 'not_configured'))
  const downloadButton = <button className={`btn ${preferImport ? 'btn-secondary' : 'btn-primary'}`} data-testid="model-download-start" onClick={() => void prepare('download')}>{t(phase === 'error' ? 'modelDownload.retryDownload' : 'modelDownload.downloadNow', { size: MODEL_SIZE })}</button>
  const importButton = <button className={`btn ${preferImport ? 'btn-primary' : 'btn-secondary'}`} data-testid="model-import-start" onClick={() => void prepare('import')}>{t('modelDownload.importLocal')}</button>
  return <div className="model-download-page">
    <div className="model-download-card" data-testid="model-download-modal" role="region" aria-label={title}>
      <div className="modal-icon">{phase === 'done' ? <CheckIcon size={24} /> : phase === 'error' ? <AlertIcon size={24} /> : <DownloadIcon size={24} />}</div>
      <div className="modal-title">{title}</div>
      <div className="modal-subtitle" role="status">{phase === 'error' ? displayError : t(`modelDownload.${phase === 'done' ? 'readySubtitle' : downloadAvailable ? 'optionalSubtitle' : 'localSetupSubtitle'}`, { size: MODEL_SIZE })}</div>
      {!downloadAvailable && phase !== 'done' && <p className="model-import-requirement" data-testid="model-download-unavailable">{t('modelDownload.notConfigured')}</p>}
      {phase === 'error' && guidanceKey && <div className="model-download-guidance" data-testid="model-download-guidance" role="status">
        <strong>{t(`${guidanceKey}.title`)}</strong>
        <p>{t(`${guidanceKey}.body`)}</p>
        <p className="model-import-requirement">{t('modelDownload.importRequirement', {
          filename: FORMULA_ASSISTANT_MODEL.fileName,
          size: MODEL_SIZE,
        })}</p>
      </div>}
      {phase === 'downloading' && <div className="download-progress" data-testid="model-download-progress">
        <div className="progress-bar-track" role="progressbar" aria-label={title} aria-valuenow={Math.min(progress, 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
        <div className="progress-stats"><span>{t('modelDownload.downloading')}</span><span>{Math.min(Math.round(progress), 100)}%</span></div>
      </div>}
      {(phase === 'loading' || phase === 'importing') && <p role="status">{t(`modelDownload.${phase === 'loading' ? 'loadingModel' : 'sha256Check'}`)}</p>}
      {(phase === 'ready' || phase === 'error') && <>
        {installed && !forceDownload && <button className="btn btn-primary" onClick={() => void prepare('installed')}>{t('modelDownload.loadExisting')}</button>}
        {preferImport ? <>{importButton}{downloadAvailable && downloadButton}</> : <>{downloadAvailable && downloadButton}{importButton}</>}
      </>}
      <button className={`btn ${phase === 'done' ? 'btn-primary' : 'btn-secondary'}`} data-testid="model-download-close" onClick={close}>{t(phase === 'done' ? 'modelDownload.returnToSettings' : 'modelDownload.cancelAndContinue')}</button>
      {/* Technical name, file and exact size stay out of the primary text. */}
      <details className="model-tech-details">
        <summary>{t('modelDownload.technicalInfo')}</summary>
        <dl>
          <dt>{t('modelDownload.techModel')}</dt><dd>{modelName || '—'}</dd>
          <dt>{t('modelDownload.techFile')}</dt><dd>{FORMULA_ASSISTANT_MODEL.fileName}</dd>
          <dt>{t('modelDownload.techSize')}</dt>
          <dd>{MODEL_SIZE} · {t('modelDownload.techSizeBytes', { bytes: formatExactBytes(FORMULA_ASSISTANT_MODEL.sizeBytes) })}</dd>
          {phase === 'error' && error && <><dt>{t('modelDownload.techError')}</dt><dd>{error}</dd></>}
        </dl>
      </details>
    </div>
  </div>
}
