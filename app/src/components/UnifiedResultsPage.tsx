import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { useSidecar } from '../hooks/useSidecar'
import AuditResultsPage from './ResultsPage'
import PiiResultsPage from './PiiResultsPage'
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
  const { results, piiResults, auditError, piiError, isBatch } = useScan()
  const [resultPanel, setResultPanel] = useState<'audit' | 'protection'>('audit')

  // Contract with the main process: an engine result carries `auditReview` or
  // `aiWarning` only when local AI actually ran for it. Without either, no AI
  // status is shown at all.
  const warning = results?.aiWarning || piiResults?.aiWarning
  const auditAiRan = Boolean(results?.auditReview || results?.aiWarning)
  // One neutral invitation, audit only (PII and extraction have no assistant yet).
  const showAiInvite = !!results && results.issues.length > 0 && !auditAiRan && !modelExists
  const withWarning = (content: JSX.Element): JSX.Element => <div className="unified-results">
    {results?.auditReview && <AuditReviewSummaryNotice review={results.auditReview} />}
    {warning && <div role="status" className="analysis-warning">{t('aiFallback')}</div>}
    {showAiInvite && <div role="note" className="analysis-warning ai-invite" data-testid="audit-ai-invite">
      <span>{tr('aiInvite')}</span>
      <button type="button" className="ai-invite-action" onClick={() => navigate('/settings')}>{tr('aiInviteAction')}</button>
    </div>}
    {piiResults && <div className="results-panel-switch" role="group" aria-label={t('piiDetection')}>
      <button type="button" className={resultPanel === 'audit' ? 'active' : ''} onClick={() => setResultPanel('audit')} data-testid="results-audit-tab">{t('ruleEngineScan')}</button>
      <button type="button" className={resultPanel === 'protection' ? 'active' : ''} onClick={() => setResultPanel('protection')} data-testid="results-protection-tab">{t('piiDetection')}</button>
    </div>}
    {content}
  </div>

  // Batch results own the file tabs and per-file failures, including files with no result.
  if (isBatch) return withWarning(<AuditResultsPage />)
  if (!results && auditError) return <EngineFailure label={t('ruleEngineScan')} error={auditError} />
  if (!results) return <EngineLoading label={t('ruleEngineScan')} />
  if (!piiResults && piiError) return withWarning(<><AuditResultsPage /><EngineFailure label={t('piiDetection')} error={piiError} /></>)
  // Workbook PII protection remains inside the audit result, never a standalone task.
  return withWarning(piiResults && resultPanel === 'protection' ? <PiiResultsPage /> : <AuditResultsPage />)
}
