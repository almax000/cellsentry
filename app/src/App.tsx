import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { SidecarProvider } from './hooks/useSidecar'
import { ScanProvider } from './context/ScanContext'
import { AuditWorkspaceProvider } from './context/AuditWorkspaceContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import HomePage from './components/HomePage'
import DropZone from './components/DropZone'
import ScanningPage from './components/ScanningPage'
import UnifiedResultsPage from './components/UnifiedResultsPage'
import SettingsPage from './components/SettingsPage'

export default function App(): JSX.Element {
  useEffect(() => {
    const saved = localStorage.getItem('cellsentry-zoom')
    if (saved) window.api?.zoom?.set(parseFloat(saved))
  }, [])

  useEffect(() => {
    if (!window.api?.onZoomChange) return
    const unsubscribe = window.api.onZoomChange((delta) => {
      if (delta === 0) {
        window.api.zoom.set(0)
        localStorage.setItem('cellsentry-zoom', '0')
      } else {
        window.api.zoom.get().then((current) => {
          const next = Math.max(-3, Math.min(3, current + delta * 0.5))
          window.api.zoom.set(next)
          localStorage.setItem('cellsentry-zoom', String(next))
        })
      }
    })
    return unsubscribe
  }, [])

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SidecarProvider>
          <ScanProvider>
            <AuditWorkspaceProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/audit" element={<DropZone task="audit" />} />
                <Route path="/scanning" element={<ScanningPage />} />
                <Route path="/results" element={<UnifiedResultsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
            </AuditWorkspaceProvider>
          </ScanProvider>
        </SidecarProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
