import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { SidecarProvider } from './hooks/useSidecar'
import { ScanProvider } from './context/ScanContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import IngestWorkspace from './components/medical/IngestWorkspace'
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
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/medical" replace />} />
                <Route path="/medical" element={<IngestWorkspace />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Legacy redirects from v1 routes */}
                <Route path="/scanning" element={<Navigate to="/medical" replace />} />
                <Route path="/results" element={<Navigate to="/medical" replace />} />
                <Route path="/pii/*" element={<Navigate to="/medical" replace />} />
                <Route path="/extract/*" element={<Navigate to="/medical" replace />} />
                <Route path="*" element={<Navigate to="/medical" replace />} />
              </Route>
            </Routes>
          </ScanProvider>
        </SidecarProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
