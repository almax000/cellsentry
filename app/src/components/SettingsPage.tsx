import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import './SettingsPage.css'
import ModelDownloadModal from './modals/ModelDownloadModal'
import type { EngineLocale } from '../../shared/locale'
import type { UpdateChannel } from '../../shared/api'
import { formatByteSize, formatExactBytes } from '../utils/byteSize'
import { FORMULA_ASSISTANT_MODEL } from '../utils/formulaAssistant'

const ZOOM_STEPS = [-2, -1.5, -0.5, 0, 0.5, 1, 2]
const ZOOM_LABELS = ['67%', '80%', '90%', '100%', '110%', '125%', '150%']

export default function SettingsPage(): JSX.Element {
  const { t } = useTranslation('settings')
  const { i18n } = useTranslation()
  const { modelLoaded, modelName, modelExists, modelError, modelSetup, refreshModelStatus, version } = useSidecar()
  const [forceModelDownload, setForceModelDownload] = useState(false)
  const [showModelDownload, setShowModelDownload] = useState(false)
  const [startingModel, setStartingModel] = useState(false)
  const [startError, setStartError] = useState('')
  useEffect(() => { void refreshModelStatus() }, [refreshModelStatus])
  const startModel = async (): Promise<void> => {
    setStartingModel(true)
    setStartError('')
    try {
      const result = await window.api.startLlm()
      if (!result.modelLoaded) setStartError(result.error || t('modelUnavailable'))
      await refreshModelStatus()
    } catch { setStartError(t('modelUnavailable')) }
    finally { setStartingModel(false) }
  }
  const [zoomIndex, setZoomIndex] = useState(3) // default 100%
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel | null>(null)

  useEffect(() => {
    window.api?.zoom?.get().then((level) => {
      const closest = ZOOM_STEPS.reduce((prev, curr, i) =>
        Math.abs(curr - level) < Math.abs(ZOOM_STEPS[prev] - level) ? i : prev, 0)
      setZoomIndex(closest)
    })
  }, [])

  useEffect(() => {
    const unsub = window.api?.onUpdateStatus?.((status) => setUpdateStatus(status))
    return () => unsub?.()
  }, [])

  useEffect(() => {
    let disposed = false
    void window.api.getUpdateChannel()
      .then((channel) => { if (!disposed) setUpdateChannel(channel) })
      .catch(() => { if (!disposed) setUpdateChannel(null) })
    return () => { disposed = true }
  }, [])

  const applyZoom = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index))
    setZoomIndex(clamped)
    window.api?.zoom?.set(ZOOM_STEPS[clamped])
    localStorage.setItem('cellsentry-zoom', String(ZOOM_STEPS[clamped]))
  }, [])

  const SUPPORTED_LANGS = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
  ] as const
  const currentLang = SUPPORTED_LANGS.find(l => i18n.language?.startsWith(l.code))?.code ?? 'en'
  const changeLanguage = async (locale: EngineLocale): Promise<void> => {
    const result = await window.api.setEngineLocale(locale)
    if (!result.success) return
    await i18n.changeLanguage(locale)
  }

  // Status is derived from the installed file first: never "ready" without a model on disk.
  const preparingModel = modelSetup.phase === 'copying' || modelSetup.phase === 'verifying'
  const preparationFailed = modelSetup.phase === 'failed' && !modelLoaded
  const assistantState = preparingModel ? 'preparing' : preparationFailed ? 'failed' : !modelExists ? 'notInstalled' : modelLoaded ? 'ready' : 'installed'
  const rawModelError = startError || modelError
  const preparationMessage = /disk space/i.test(rawModelError ?? '') ? 'modelPreparationDiskSpace' : 'modelPreparationFailed'
  const sizeText = formatByteSize(FORMULA_ASSISTANT_MODEL.sizeBytes)

  if (showModelDownload) return <ModelDownloadModal forceDownload={forceModelDownload} onClose={() => { setShowModelDownload(false); void refreshModelStatus() }} />

  return (
    <div className="settings-container view-enter">
      {/* On-device AI Section: one row per task assistant (formula only for now) */}
      <div className="settings-section">
        <div className="settings-section-title">{t('aiModel')}</div>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-main">
              <div className="settings-label">{t('formulaAssistant')}</div>
              <div className="settings-desc">{t('formulaAssistantDesc')}</div>
            </div>
            <div
              className="settings-value settings-assistant-status"
              data-testid="settings-ai-status"
              style={{ color: assistantState === 'ready' ? 'var(--success)' : 'var(--text-muted)' }}
            >
              {assistantState === 'ready'
                ? `● ${t('statusReady')}`
                : `○ ${t(assistantState === 'preparing' ? 'statusPreparing' : assistantState === 'failed' ? 'statusPreparationFailed' : assistantState === 'installed' ? 'statusInstalled' : 'statusNotInstalled')}`}
            </div>
          </div>
          {assistantState !== 'ready' && <div className="settings-row">
            <div className="settings-desc settings-row-main" role="status">
              {preparingModel ? t('modelPreparing') : preparationFailed ? t(preparationMessage) : modelExists && rawModelError ? t('modelUnavailable') : t('optionalModel', { size: sizeText })}
            </div>
            <div className="settings-actions">
              <button className="btn btn-primary" data-testid="settings-setup-model" disabled={startingModel || preparingModel}
                onClick={() => {
                  if (preparationFailed) { setForceModelDownload(true); setShowModelDownload(true) }
                  else if (modelExists) void startModel()
                  else setShowModelDownload(true)
                }}>
                {preparingModel ? t('statusPreparing') : startingModel ? t('loadingModel') : t(preparationFailed ? 'recoverModel' : modelExists ? 'retryModel' : 'downloadModel')}
              </button>
              {modelExists && !preparationFailed && <button className="btn btn-secondary" data-testid="settings-redownload-model" disabled={startingModel || preparingModel}
                onClick={() => { setForceModelDownload(true); setShowModelDownload(true) }}>{t('redownloadModel')}</button>}
            </div>
          </div>}
          <details className="settings-tech">
            <summary>{t('technicalInfo')}</summary>
            <dl>
              <dt>{t('techModel')}</dt><dd>{modelName || '—'}</dd>
              <dt>{t('techFile')}</dt><dd>{FORMULA_ASSISTANT_MODEL.fileName}</dd>
              <dt>{t('techSize')}</dt>
              <dd>{sizeText} · {t('techSizeBytes', { bytes: formatExactBytes(FORMULA_ASSISTANT_MODEL.sizeBytes) })}</dd>
              {rawModelError && <><dt>{t('techError')}</dt><dd>{rawModelError}</dd></>}
            </dl>
          </details>
        </div>
      </div>

      {/* Appearance Section */}
      <div className="settings-section">
        <div className="settings-section-title">{t('appearance')}</div>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-label">{t('zoomLevel')}</div>
            <div className="zoom-controls">
              <button
                className="zoom-btn"
                data-testid="settings-zoom-out"
                disabled={zoomIndex <= 0}
                onClick={() => applyZoom(zoomIndex - 1)}
              >
                -
              </button>
              <span className="zoom-value" data-testid="settings-zoom-value">{ZOOM_LABELS[zoomIndex]}</span>
              <button
                className="zoom-btn"
                data-testid="settings-zoom-in"
                disabled={zoomIndex >= ZOOM_STEPS.length - 1}
                onClick={() => applyZoom(zoomIndex + 1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label">{t('language')}</div>
            <select
              className="lang-select"
              data-testid="settings-lang-select"
              value={currentLang}
              onChange={(e) => { void changeLanguage(e.target.value as EngineLocale) }}
            >
              {SUPPORTED_LANGS.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="settings-section">
        <div className="settings-section-title">{t('about')}</div>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-label">{t('version')}</div>
            <div
              className="settings-value"
              data-testid="settings-version"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            >
              {version || '—'}
              <span className="beta-badge">BETA</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label">{t('website')}</div>
            <div
              className="settings-value"
              style={{ color: 'var(--brand)', cursor: 'pointer' }}
              onClick={() => window.open('https://cellsentry.pro')}
            >
              cellsentry.pro
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Section */}
      <div className="settings-section">
        <div className="settings-section-title">{t('feedback')}</div>
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-label">{t('reportBug')}</div>
              <div className="settings-desc">{t('reportBugDesc')}</div>
            </div>
            <div
              className="settings-value feedback-link"
              onClick={() => window.open('https://github.com/almax000/cellsentry/issues/new/choose')}
            >
              GitHub Issues <span className="external-icon">↗</span>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">{t('sendFeedback')}</div>
              <div className="settings-desc">{t('sendFeedbackDesc')}</div>
            </div>
            <div
              className="settings-value feedback-link"
              onClick={() => window.open('https://x.com/messages/compose?recipient_id=almax000')}
            >
              @almax000 <span className="external-icon">↗</span>
            </div>
          </div>
        </div>
      </div>

      {/* Updates Section */}
      <div className="settings-section">
        <div className="settings-section-title">{t('updates')}</div>
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-label">
                {updateChannel === 'store' && <span data-testid="settings-updates-store-managed">{t('updatesManagedByStore')}</span>}
                {updateChannel === null && t('updatesUnavailable')}
                {updateChannel === 'manual' && !updateStatus && t('checkForUpdates')}
                {updateChannel === 'manual' && updateStatus?.status === 'checking' && t('checkForUpdates')}
                {updateChannel === 'manual' && updateStatus?.status === 'not-available' && t('upToDate')}
                {updateChannel === 'manual' && updateStatus?.status === 'available' && t('updateAvailable', { version: updateStatus.version })}
                {updateChannel === 'manual' && updateStatus?.status === 'downloading' && t('downloading')}
                {updateChannel === 'manual' && updateStatus?.status === 'downloaded' && t('readyToInstall')}
                {updateChannel === 'manual' && updateStatus?.status === 'error' && (
                  <>
                    {t('updateError')}
                    {updateStatus.error && (
                      <div className="settings-desc" style={{ color: 'var(--danger)' }}>
                        {updateStatus.error}
                      </div>
                    )}
                  </>
                )}
              </div>
              {updateChannel === 'manual' && updateStatus?.status === 'downloading' && updateStatus.percent != null && (
                <div className="update-progress">
                  <div className="update-progress-fill" style={{ width: `${updateStatus.percent}%` }} />
                </div>
              )}
            </div>
            <div>
              {updateChannel === 'manual' && (!updateStatus || updateStatus.status === 'not-available' || updateStatus.status === 'error') && (
                <button
                  className="btn btn-primary"
                  data-testid="settings-check-updates"
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => window.api?.checkForUpdates()}
                  disabled={updateStatus?.status === 'checking'}
                >
                  {updateStatus?.status === 'checking' ? t('checking') : t('checkForUpdates')}
                </button>
              )}
              {updateChannel === 'manual' && updateStatus?.status === 'available' && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => window.api?.downloadUpdate()}
                >
                  {t('download')}
                </button>
              )}
              {updateChannel === 'manual' && updateStatus?.status === 'downloaded' && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => window.api?.installUpdate()}
                >
                  {t('installAndRestart')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
