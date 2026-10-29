import { useLocation } from 'react-router-dom'
import { useScan } from '../context/ScanContext'
import ExportButton from './ExportButton'
import { LocalOnlyBadge } from './LocalOnly'
import './Header.css'
import { useTheme } from '../hooks/useTheme'
import { useTranslation } from 'react-i18next'

interface HeaderProps {
  title: string
  icon?: JSX.Element | null
}

export default function Header({ title, icon }: HeaderProps): JSX.Element {
  const location = useLocation()
  const { activeView } = useScan()
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation('results')

  const showExport = location.pathname === '/results' && activeView === 'audit'

  return (
    <header className="main-header">
      <div className="header-title" data-testid="header-title">
        {icon && <span data-testid="header-icon">{icon}</span>}
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        <button type="button" className="btn btn-ghost" data-testid="theme-toggle" onClick={toggleTheme}>{t(theme === 'light' ? 'workspace.dark' : 'workspace.light')}</button>
        {showExport && <span data-testid="header-export-btn"><ExportButton /></span>}
        <LocalOnlyBadge />
      </div>
    </header>
  )
}
