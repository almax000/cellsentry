import { useLocation, useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { useRedact } from '../redact/RedactContext'
import { CellSentryMark } from './icons'
import { TaskIcon } from './icons/taskIcons'
import { TASKS, TASK_ORDER, type TaskId } from '../tasks'
import './Sidebar.css'

export default function Sidebar(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()
  const {
    activeView, setActiveView,
    results, piiResults, extractionResults,
    auditError, piiError, extractionError,
  } = useScan()

  const { stage: redactStage } = useRedact()
  const isOnResults = location.pathname === '/results'

  const hasResults = (id: TaskId): boolean => {
    switch (id) {
      case 'audit': return !!(results || auditError)
      case 'pii': return !!(piiResults || piiError)
      case 'extraction': return !!(extractionResults || extractionError)
    }
  }

  const getBadgeCount = (id: TaskId): number | null => {
    if (!isOnResults) return null
    switch (id) {
      case 'audit': return results?.summary.total ?? null
      case 'pii': return piiResults?.findings.length ?? null
      case 'extraction': {
        if (!extractionResults) return null
        return (extractionResults.fields?.length || 0) + (extractionResults.tables?.length || 0)
      }
    }
  }

  // Always clickable: show this task's results when there are some, otherwise its entry page.
  // A document redaction in progress comes first for the redaction task.
  const handleTaskClick = (id: TaskId): void => {
    if (id === 'pii' && redactStage !== 'idle') {
      navigate(redactStage === 'ready' ? '/redact/review' : '/redact/read')
    } else if (!hasResults(id)) {
      navigate(TASKS[id].route)
    } else if (isOnResults) {
      setActiveView(id)
    } else {
      flushSync(() => setActiveView(id))
      navigate('/results')
    }
  }

  const isActive = (id: TaskId): boolean =>
    (isOnResults && activeView === id) || location.pathname === TASKS[id].route
    || (id === 'pii' && location.pathname.startsWith('/redact/'))

  const isHomeActive = location.pathname === '/'

  return (
    <nav className="sidebar">
      <div className="sidebar-nav">
        <button
          type="button"
          className={`sidebar-item sidebar-home ${isHomeActive ? 'active' : ''}`}
          data-testid="sidebar-nav-home"
          aria-current={isHomeActive ? 'page' : undefined}
          onClick={() => navigate('/')}
        >
          <span className="sidebar-item-icon sidebar-home-icon" aria-hidden="true">
            <CellSentryMark size={32} />
          </span>
          <span className="sidebar-label">{t('sidebar.home')}</span>
        </button>

        {TASK_ORDER.map((id) => {
          const badge = getBadgeCount(id)
          return (
            <button
              type="button"
              key={id}
              className={`sidebar-item ${isActive(id) ? 'active' : ''}`}
              data-testid={`sidebar-nav-${id}`}
              aria-current={isActive(id) ? 'page' : undefined}
              onClick={() => handleTaskClick(id)}
            >
              <span className="sidebar-item-icon" aria-hidden="true"><TaskIcon task={id} size={22} /></span>
              <span className="sidebar-label">{t(`sidebar.${id}`)}</span>
              {badge !== null && badge > 0 && (
                <span className="sidebar-badge">{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          )
        })}
      </div>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <button
          type="button"
          className={`sidebar-item ${location.pathname === '/settings' ? 'active' : ''}`}
          data-testid="sidebar-nav-settings"
          aria-current={location.pathname === '/settings' ? 'page' : undefined}
          onClick={() => navigate('/settings')}
        >
          <span className="sidebar-item-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span className="sidebar-label">{t('sidebar.settings')}</span>
        </button>
      </div>
    </nav>
  )
}
