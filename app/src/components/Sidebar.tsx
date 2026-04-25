import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CellSentryMark } from './icons'
import './Sidebar.css'

// v2 minimal sidebar: home + settings. The 3-engine view switcher (audit/pii/
// extraction) was removed in W1 Step 1.1. v2's medical pipeline is single-flow.

export default function Sidebar(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()

  const isHomeActive = location.pathname !== '/settings'

  return (
    <nav className="sidebar">
      <div className="sidebar-nav">
        <div
          className={`sidebar-item sidebar-home ${isHomeActive ? 'active' : ''}`}
          data-testid="sidebar-nav-home"
          onClick={() => navigate('/')}
        >
          <span className="sidebar-item-icon sidebar-home-icon">
            <CellSentryMark size={28} />
          </span>
          <span className="sidebar-tooltip">
            {t('appName', 'CellSentry')}
          </span>
        </div>
      </div>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <div
          className={`sidebar-item ${location.pathname === '/settings' ? 'active' : ''}`}
          data-testid="sidebar-nav-settings"
          onClick={() => navigate('/settings')}
        >
          <span className="sidebar-item-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span className="sidebar-tooltip">{t('sidebar.settings', 'Settings')}</span>
        </div>
      </div>
    </nav>
  )
}
