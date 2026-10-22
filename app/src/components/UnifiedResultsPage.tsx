import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { useSidecar } from '../hooks/useSidecar'
import AuditResultsPage from './ResultsPage'
import PiiResultsPage from './PiiResultsPage'
import ExtractionResultsPage from './ExtractionResultsPage'
import { ShieldIcon } from './icons'
import { AuditReviewSummaryNotice } from './AuditReviewNotice'

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

function EngineFailure({ label, error }: { label: string; error: string }): JSX.Element {
  return (
    <div className="no-issues-container view-enter" role="alert">
      <div className="no-issues-title" style={{ fontSize: 16 }}>{label}</div>
      <div style={{ maxWidth: 480, marginTop: 12, color: 'var(--danger)', textAlign: 'center', wordBreak: 'break-word' }}>
        {error}
      </div>
    </div>
  )
}

export default function UnifiedResultsPage(): JSX.Element {
  const { t } = useTranslation('scanning')
  const { t: tr } = useTranslation('results')
  const navigate = useNavigate()
  const { modelExists } = useSidecar()
  const { activeView, results, piiResults, extractionResults, auditError, piiError, extractionError } = useScan()

  // Contract with the main process: an engine result carries `auditReview` or
  // `aiWarning` only when local AI actually ran for it. Without either, no AI
  // status is shown at all.
  const warning = activeView === 'pii' ? piiResults?.aiWarning : activeView === 'extraction' ? extractionResults?.aiWarning : results?.aiWarning
  const auditAiRan = Boolean(results?.auditReview || results?.aiWarning)
  // One neutral invitation, audit only (PII and extraction have no assistant yet).
  const showAiInvite = activeView === 'audit' && !!results && results.issues.length > 0 && !auditAiRan && !modelExists
  const withWarning = (content: JSX.Element): JSX.Element => <div className="unified-results">
    {activeView === 'audit' && results?.auditReview && <AuditReviewSummaryNotice review={results.auditReview} />}
    {warning && <div role="status" className="analysis-warning">{t('aiFallback')}</div>}
    {showAiInvite && <div role="note" className="analysis-warning ai-invite" data-testid="audit-ai-invite">
      <span>{tr('aiInvite')}</span>
      <button type="button" className="ai-invite-action" onClick={() => navigate('/settings')}>{tr('aiInviteAction')}</button>
    </div>}
    {content}
  </div>

  switch (activeView) {
    case 'pii':
      if (!piiResults && !piiError) return <EngineLoading label={t('piiDetection')} />
      if (!piiResults && piiError) return <EngineFailure label={t('piiDetection')} error={piiError} />
      return withWarning(<PiiResultsPage />)
    case 'extraction':
      if (!extractionResults && !extractionError) return <EngineLoading label={t('dataExtraction')} />
      if (!extractionResults && extractionError) return <EngineFailure label={t('dataExtraction')} error={extractionError} />
      return withWarning(<ExtractionResultsPage />)
    default:
      if (!results && auditError) return <EngineFailure label={t('ruleEngineScan')} error={auditError} />
      return withWarning(<AuditResultsPage />)
  }
}
