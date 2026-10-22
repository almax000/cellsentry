import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { SidecarProvider } from './hooks/useSidecar'
import { ScanProvider } from './context/ScanContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import HomePage from './components/HomePage'
import DropZone from './components/DropZone'
import ScanningPage from './components/ScanningPage'
import UnifiedResultsPage from './components/UnifiedResultsPage'
import SettingsPage from './components/SettingsPage'
import { RedactProvider } from './redact/RedactContext'
import RedactEntryPage from './components/redact/RedactEntryPage'
import RedactReadingPage from './components/redact/RedactReadingPage'
import RedactReviewPage from './components/redact/RedactReviewPage'
import RedactSharePage from './components/redact/RedactSharePage'
import RedactRestorePage from './components/redact/RedactRestorePage'

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
            <RedactProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/pii" element={<RedactEntryPage />} />
                <Route path="/redact/read" element={<RedactReadingPage />} />
                <Route path="/redact/review" element={<RedactReviewPage />} />
                <Route path="/redact/share" element={<RedactSharePage />} />
                <Route path="/redact/restore" element={<RedactRestorePage />} />
                <Route path="/audit" element={<DropZone task="audit" />} />
                <Route path="/extract" element={<DropZone task="extraction" />} />
                <Route path="/scanning" element={<ScanningPage />} />
                <Route path="/results" element={<UnifiedResultsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Legacy redirects */}
                <Route path="/pii/scanning" element={<Navigate to="/scanning" replace />} />
                <Route path="/pii/results" element={<Navigate to="/results" replace />} />
                <Route path="/extract/scanning" element={<Navigate to="/scanning" replace />} />
                <Route path="/extract/results" element={<Navigate to="/results" replace />} />
              </Route>
            </Routes>
            </RedactProvider>
          </ScanProvider>
        </SidecarProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
