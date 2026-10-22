import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import Header from './Header'
import ConnectionBanner from './ConnectionBanner'
import FileDropRouter from './FileDropRouter'
import { useScan } from '../context/ScanContext'
import { ShieldCheckIcon, CheckIcon } from './icons'
import { TaskIcon } from './icons/taskIcons'
import { taskForRoute } from '../tasks'
import './Layout.css'

export default function Layout(): JSX.Element {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()
  const { activeView, scanState, runSeq } = useScan()
  const platform = window.api?.platform || 'linux'

  const entryTask = taskForRoute(location.pathname)

  // Whatever started a scan (entry page, window drop, test trigger), show its progress,
  // or its results when it finished before this effect ran.
  const seenRunSeq = useRef(runSeq)
  useEffect(() => {
    if (runSeq === seenRunSeq.current) return
    seenRunSeq.current = runSeq
    const target = scanState === 'complete' ? '/results' : '/scanning'
    if (location.pathname !== target) navigate(target)
  }, [runSeq, scanState, location.pathname, navigate])

  const pageTitle = (): string => {
    const path = location.pathname
    if (path === '/') return t('header.home')
    if (entryTask) return t(`header.${entryTask.id}Entry`)
    if (path.startsWith('/redact/')) return t('header.piiEntry')
    if (path === '/settings') return t('header.settings')
    if (path === '/scanning') return t('header.scanning')
    if (path === '/results') {
      switch (activeView) {
        case 'pii': return t('header.piiResults')
        case 'extraction': return t('header.extractionResults')
        default: return t('header.scanResults')
      }
    }
    return t('header.home')
  }

  const pageIcon = (): JSX.Element | null => {
    const path = location.pathname
    if (entryTask) return <TaskIcon task={entryTask.id} size={15} />
    if (path.startsWith('/redact/')) return <TaskIcon task="pii" size={15} />
    if (path === '/scanning') return <ShieldCheckIcon size={15} />
    if (path === '/results') return <CheckIcon size={15} />
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
      <FileDropRouter />
    </div>
  )
}
