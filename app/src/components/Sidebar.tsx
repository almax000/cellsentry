import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './Sidebar.css'

interface NavItem {
  id: string
  testId: string
  path: string
  icon: JSX.Element
  labelKey: string
  disabled?: boolean
  soon?: boolean
}

const navItems: NavItem[] = [
  {
    id: 'formula',
    testId: 'sidebar-nav-audit',
    path: '/',
    labelKey: 'sidebar.spreadsheetAudit',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </svg>
    )
  },
  {
    id: 'pii',
    testId: 'sidebar-nav-pii',
    path: '/pii',
    labelKey: 'sidebar.piiRedaction',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  },
  {
    id: 'extract',
    testId: 'sidebar-nav-extraction',
    path: '/extract',
    labelKey: 'sidebar.dataExtraction',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  }
]

export default function Sidebar(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (item: NavItem): boolean => {
    if (item.path === '/') {
      return location.pathname === '/' || location.pathname === '/scanning' || location.pathname === '/results'
    }
    return location.pathname.startsWith(item.path)
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`sidebar-item ${isActive(item) ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
            data-testid={item.testId}
            onClick={() => !item.disabled && navigate(item.path)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-tooltip">
              {t(item.labelKey)}
              {item.soon && <span className="soon-tag">{t('soon')}</span>}
            </span>
          </div>
        ))}
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
          <span className="sidebar-tooltip">{t('sidebar.settings')}</span>
        </div>
      </div>
    </nav>
  )
}
