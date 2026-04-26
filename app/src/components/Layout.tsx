import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import Header from './Header'
import ConnectionBanner from './ConnectionBanner'
import V2UpgradeBanner from './medical/V2UpgradeBanner'
import { GridIcon, ShieldCheckIcon } from './icons'
import './Layout.css'

export default function Layout(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const platform = window.api?.platform || 'linux'

  const pageTitle = (): string => {
    const path = location.pathname
    if (path === '/settings') return t('header.settings', 'Settings')
    return t('header.medicalPseudonymize', 'Medical Pseudonymize')
  }

  const pageIcon = (): JSX.Element | null => {
    const path = location.pathname
    if (path === '/settings') return null
    return <ShieldCheckIcon size={15} />
  }

  // Reserved for the future v2 results / diff view layout.
  // For W1 stub, no full-bleed pages exist.
  void GridIcon

  return (
    <div className={`app-layout platform-${platform}`}>
      <Sidebar />
      <div className="main-content">
        <Header title={pageTitle()} icon={pageIcon()} />
        <ConnectionBanner />
        <div className="main-body">
          <Outlet />
        </div>
      </div>
      <V2UpgradeBanner />
    </div>
  )
}
