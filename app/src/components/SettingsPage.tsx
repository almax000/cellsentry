import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import './SettingsPage.css'

const ZOOM_STEPS = [-2, -1.5, -0.5, 0, 0.5, 1, 2]
const ZOOM_LABELS = ['67%', '80%', '90%', '100%', '110%', '125%', '150%']

export default function SettingsPage(): JSX.Element {
  const { t } = useTranslation('settings')
  const { i18n } = useTranslation()
  const { modelLoaded, modelName, version } = useSidecar()
  const [zoomIndex, setZoomIndex] = useState(3) // default 100%
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

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

  const applyZoom = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index))
    setZoomIndex(clamped)
    window.api?.zoom?.set(ZOOM_STEPS[clamped])
    localStorage.setItem('cellsentry-zoom', String(ZOOM_STEPS[clamped]))
  }, [])

  const SUPPORTED_LANGS = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'es', label: 'Español' },
  ] as const
  const currentLang = SUPPORTED_LANGS.find(l => i18n.language?.startsWith(l.code))?.code ?? 'en'

  return (
    <div className="settings-container view-enter">
      {/* AI Model Section */}
      <div className="settings-section">
        <div className="settings-section-title">{t('aiModel')}</div>
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-label">{t('modelStatus')}</div>
              <div className="settings-desc">
                {modelName || 'cellsentry-1.5b-v2'} (920 MB)
              </div>
            </div>
            <div
              className="settings-value"
              style={{ color: modelLoaded ? 'var(--success)' : 'var(--text-muted)' }}
            >
              {modelLoaded ? `● ${t('modelLoaded')}` : `○ ${t('modelNotLoaded')}`}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">{t('aiAnalysis')}</div>
              <div className="settings-desc">
                {t('aiAnalysisDesc')}
              </div>
            </div>
            <div className="settings-value" style={{ color: 'var(--success)' }}>
              {t('enabled')}
            </div>
          </div>
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
              onChange={(e) => i18n.changeLanguage(e.target.value)}
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
              {version || '1.0.0-beta.1'}
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
                {!updateStatus && t('checkForUpdates')}
                {updateStatus?.status === 'checking' && t('checkForUpdates')}
                {updateStatus?.status === 'not-available' && t('upToDate')}
                {updateStatus?.status === 'available' && t('updateAvailable', { version: updateStatus.version })}
                {updateStatus?.status === 'downloading' && t('downloading')}
                {updateStatus?.status === 'downloaded' && t('readyToInstall')}
                {updateStatus?.status === 'error' && (
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
              {updateStatus?.status === 'downloading' && updateStatus.percent != null && (
                <div className="update-progress">
                  <div className="update-progress-fill" style={{ width: `${updateStatus.percent}%` }} />
                </div>
              )}
            </div>
            <div>
              {(!updateStatus || updateStatus.status === 'not-available' || updateStatus.status === 'error') && (
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
              {updateStatus?.status === 'available' && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                  onClick={() => window.api?.downloadUpdate()}
                >
                  {t('download')}
                </button>
              )}
              {updateStatus?.status === 'downloaded' && (
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
