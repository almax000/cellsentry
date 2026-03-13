import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import Header from './Header'
import ConnectionBanner from './ConnectionBanner'
import ModelDownloadModal from './modals/ModelDownloadModal'
import { GridIcon, ShieldCheckIcon, CheckIcon } from './icons'
import './Layout.css'

export default function Layout(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const platform = window.api?.platform || 'linux'
  const [showModelModal, setShowModelModal] = useState(false)

  useEffect(() => {
    if (!window.api?.checkModelExists) return
    window.api.checkModelExists()
      .then((result) => {
        if (!result.exists) setShowModelModal(true)
      })
      .catch(() => {})
  }, [])

  const handleModelReady = async (): Promise<void> => {
    setShowModelModal(false)
    try {
      await window.api?.startLlm?.()
    } catch { /* LLM start will be retried on first scan */ }
  }

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
      {showModelModal && <ModelDownloadModal onClose={handleModelReady} />}
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
