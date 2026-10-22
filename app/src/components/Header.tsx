import { useLocation } from 'react-router-dom'
import { useScan } from '../context/ScanContext'
import ExportButton from './ExportButton'
import { LocalOnlyBadge } from './LocalOnly'
import './Header.css'

interface HeaderProps {
  title: string
  icon?: JSX.Element | null
}

export default function Header({ title, icon }: HeaderProps): JSX.Element {
  const location = useLocation()
  const { activeView } = useScan()

  const showExport = location.pathname === '/results' && activeView === 'audit'

  return (
    <header className="main-header">
      <div className="header-title" data-testid="header-title">
        {icon && <span data-testid="header-icon">{icon}</span>}
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        {showExport && <span data-testid="header-export-btn"><ExportButton /></span>}
        <LocalOnlyBadge />
      </div>
    </header>
  )
}
