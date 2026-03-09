import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import './ConnectionBanner.css'

export default function ConnectionBanner(): JSX.Element | null {
  const { t } = useTranslation('common')
  const { status } = useSidecar()
  const [dismissed, setDismissed] = useState(false)
  const wasConnected = useRef(false)

  // Track whether we've ever been connected
  useEffect(() => {
    if (status === 'connected') {
      wasConnected.current = true
      setDismissed(false) // reset dismiss on reconnect
    }
  }, [status])

  const shouldShow = !dismissed && wasConnected.current && status === 'disconnected'
  if (!shouldShow) return null

  return (
    <div className="connection-banner" data-testid="connection-banner">
      <div className="connection-banner-content">
        <span className="connection-banner-dot" />
        <span>{t('connectionLost')}</span>
      </div>
      <button
        className="connection-banner-dismiss"
        data-testid="connection-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label={t('dismiss')}
      >
        ✕
      </button>
    </div>
  )
}
