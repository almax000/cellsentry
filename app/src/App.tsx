import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { SidecarProvider } from './hooks/useSidecar'
import { ScanProvider } from './context/ScanContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import DropZone from './components/DropZone'
import ScanningPage from './components/ScanningPage'
import ResultsPage from './components/ResultsPage'
import SettingsPage from './components/SettingsPage'
import PiiDropZone from './components/PiiDropZone'
import PiiResultsPage from './components/PiiResultsPage'
import ExtractionDropZone from './components/ExtractionDropZone'
import ExtractionResultsPage from './components/ExtractionResultsPage'

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
                {/* Audit mode */}
                <Route path="/" element={<DropZone />} />
                <Route path="/scanning" element={<ScanningPage />} />
                <Route path="/results" element={<ResultsPage />} />
                {/* PII mode */}
                <Route path="/pii" element={<PiiDropZone />} />
                <Route path="/pii/scanning" element={<ScanningPage />} />
                <Route path="/pii/results" element={<PiiResultsPage />} />
                {/* Extraction mode */}
                <Route path="/extract" element={<ExtractionDropZone />} />
                <Route path="/extract/scanning" element={<ScanningPage />} />
                <Route path="/extract/results" element={<ExtractionResultsPage />} />
                {/* Settings */}
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </ScanProvider>
        </SidecarProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
