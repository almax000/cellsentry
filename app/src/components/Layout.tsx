import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import Header from './Header'
import ConnectionBanner from './ConnectionBanner'
import { GridIcon, ShieldCheckIcon, CheckIcon } from './icons'
import './Layout.css'

export default function Layout(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const platform = window.api?.platform || 'linux'

  const pageTitle = (): string => {
    switch (location.pathname) {
      case '/settings':
        return t('header.settings')
      case '/scanning':
        return t('header.scanning')
      case '/results':
        return t('header.scanResults')
      default:
        return t('header.spreadsheetAudit')
    }
  }

  const pageIcon = (): JSX.Element | null => {
    switch (location.pathname) {
      case '/':
        return <GridIcon size={15} />
      case '/scanning':
        return <ShieldCheckIcon size={15} />
      case '/results':
        return <CheckIcon size={15} />
      default:
        return null
    }
  }

  // Results page uses full-bleed split panel (no padding, no overflow)
  const isNoPad = location.pathname === '/results'

  return (
    <div className={`app-layout platform-${platform}`}>
      <Sidebar />
      <div className="main-content">
        <Header title={pageTitle()} icon={pageIcon()} />
        <ConnectionBanner />
        <div className={`main-body${isNoPad ? ' no-pad' : ''}`}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
