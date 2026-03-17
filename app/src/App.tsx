import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { SidecarProvider } from './hooks/useSidecar'
import { ScanProvider } from './context/ScanContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
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
            <Routes>
              <Route element={<Layout />}>
                {/* Unified flow */}
                <Route path="/" element={<DropZone />} />
                <Route path="/scanning" element={<ScanningPage />} />
                <Route path="/results" element={<UnifiedResultsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Legacy redirects */}
                <Route path="/pii" element={<Navigate to="/" replace />} />
                <Route path="/pii/scanning" element={<Navigate to="/scanning" replace />} />
                <Route path="/pii/results" element={<Navigate to="/results" replace />} />
                <Route path="/extract" element={<Navigate to="/" replace />} />
                <Route path="/extract/scanning" element={<Navigate to="/scanning" replace />} />
                <Route path="/extract/results" element={<Navigate to="/results" replace />} />
              </Route>
            </Routes>
          </ScanProvider>
        </SidecarProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
