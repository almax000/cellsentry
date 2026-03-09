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
    const path = location.pathname
    if (path === '/settings') return t('header.settings')
    if (path.startsWith('/pii')) {
      if (path.includes('scanning')) return t('header.scanning')
      if (path.includes('results')) return t('header.piiResults')
      return t('header.piiRedaction')
    }
    if (path.startsWith('/extract')) {
      if (path.includes('scanning')) return t('header.scanning')
      if (path.includes('results')) return t('header.extractionResults')
      return t('header.dataExtraction')
    }
    if (path === '/scanning') return t('header.scanning')
    if (path === '/results') return t('header.scanResults')
    return t('header.spreadsheetAudit')
  }

  const pageIcon = (): JSX.Element | null => {
    const path = location.pathname
    if (path === '/' || path === '/pii' || path === '/extract') return <GridIcon size={15} />
    if (path.includes('scanning')) return <ShieldCheckIcon size={15} />
    if (path.includes('results')) return <CheckIcon size={15} />
    return null
  }

  // Results pages use full-bleed split panel (no padding, no overflow)
  const isNoPad = location.pathname.includes('/results')

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
