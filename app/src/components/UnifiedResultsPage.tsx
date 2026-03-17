import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import AuditResultsPage from './ResultsPage'
import PiiResultsPage from './PiiResultsPage'
import ExtractionResultsPage from './ExtractionResultsPage'
import { ShieldIcon } from './icons'

function EngineLoading({ label }: { label: string }): JSX.Element {
  return (
    <div className="no-issues-container view-enter">
      <div className="no-issues-icon" style={{ opacity: 0.5 }}>
        <ShieldIcon size={32} />
      </div>
      <div className="no-issues-title" style={{ fontSize: 16 }}>
        {label}
      </div>
      <div className="scan-ring" style={{ width: 32, height: 32, marginTop: 12 }} />
    </div>
  )
}

export default function UnifiedResultsPage(): JSX.Element {
  const { t } = useTranslation('scanning')
  const { activeView, results, piiResults, extractionResults, piiError, extractionError } = useScan()

  switch (activeView) {
    case 'pii':
      if (!piiResults && !piiError) return <EngineLoading label={t('piiDetection')} />
      return <PiiResultsPage />
    case 'extraction':
      if (!extractionResults && !extractionError) return <EngineLoading label={t('dataExtraction')} />
      return <ExtractionResultsPage />
    default:
      return <AuditResultsPage />
  }
}
