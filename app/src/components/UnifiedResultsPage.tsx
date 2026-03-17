import { useScan } from '../context/ScanContext'
import AuditResultsPage from './ResultsPage'
import PiiResultsPage from './PiiResultsPage'
import ExtractionResultsPage from './ExtractionResultsPage'

export default function UnifiedResultsPage(): JSX.Element {
  const { activeView } = useScan()

  switch (activeView) {
    case 'pii':
      return <PiiResultsPage />
    case 'extraction':
      return <ExtractionResultsPage />
    default:
      return <AuditResultsPage />
  }
}
