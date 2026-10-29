import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { useSidecar } from '../hooks/useSidecar'
import AuditResultsPage from './ResultsPage'
import { AuditReviewSummaryNotice } from './AuditReviewNotice'

export default function UnifiedResultsPage(): JSX.Element {
  const { t } = useTranslation('results')
  const navigate = useNavigate()
  const { modelExists } = useSidecar()
  const { results, auditError, isBatch } = useScan()
  if (!isBatch && !results) return <div className="aw-empty" role={auditError ? 'alert' : 'status'}><h2>{auditError || t('previewLoading')}</h2><button className="btn btn-ghost" onClick={() => navigate('/audit')}>{t('workspace.anotherFile')}</button></div>
  const aiRan = Boolean(results?.auditReview || results?.aiWarning)
  return <div className="unified-results">
    {results?.auditReview && <AuditReviewSummaryNotice review={results.auditReview} />}
    {results?.aiWarning && <div role="status" className="analysis-warning">{t('workspace.aiFailed')}</div>}
    {!!results?.issues.length && !aiRan && !modelExists && <div className="analysis-warning ai-invite" data-testid="audit-ai-invite"><span>{t('aiInvite')}</span><button className="btn btn-ghost" onClick={() => navigate('/settings')}>{t('aiInviteAction')}</button></div>}
    <AuditResultsPage />
  </div>
}
