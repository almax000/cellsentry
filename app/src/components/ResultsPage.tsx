import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { useAuditWorkspace } from '../context/AuditWorkspaceContext'
import { reviewKey, type ReviewStatus } from '../../shared/auditWorkspace'
import type { Issue } from '../types'
import { auditAiStatusKey } from '../utils/auditDraft'
import { FileSpreadsheetIcon, AlertIcon } from './icons'
import SpreadsheetPreview from './SpreadsheetPreview'
import { AuditReviewProgressNotice } from './AuditReviewNotice'
import './ResultsPage.css'
import './AuditWorkspace.css'

const STATUSES: ReviewStatus[] = ['pending', 'confirmed', 'not-applicable']
type ReviewFilter = 'all' | ReviewStatus
const observation = (value: unknown, missing: string): string => value == null ? missing : typeof value === 'object' ? JSON.stringify(value) : String(value)

export default function AuditResultsPage(): JSX.Element {
  const { t } = useTranslation('results')
  const navigate = useNavigate()
  const { results, fileInfo, reset, isBatch, batchFiles, batchIndex, scanState, error, selectBatchFile, cancelScan, stopRetryRequired, progress } = useScan()
  const { decisions, updateDecision, draftError, retrySave } = useAuditWorkspace()
  const issues = results?.issues || []
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [severity, setSeverity] = useState('all')
  const [selectedKey, setSelectedKey] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 1180)
  const drawer = useRef<HTMLDialogElement>(null)
  const reviewButton = useRef<HTMLButtonElement>(null)
  const identity = JSON.stringify([results?.filePath, results?.sourceFingerprint || results?.scannedAt])
  useEffect(() => { setSelectedKey(''); setReviewFilter('all'); setSeverity('all'); setDrawerOpen(false) }, [identity])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1180px)')
    const change = (): void => setNarrow(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => { if (narrow && drawerOpen) drawer.current?.showModal() }, [narrow, drawerOpen])
  const filtered = useMemo(() => issues.filter(issue =>
    (reviewFilter === 'all' || (decisions[reviewKey(issue)]?.status || 'pending') === reviewFilter) && (severity === 'all' || issue.severity === severity)
  ), [issues, decisions, reviewFilter, severity])
  const selected = filtered.find(issue => reviewKey(issue) === selectedKey) || filtered[0] || null
  const confirmed = issues.filter(issue => decisions[reviewKey(issue)]?.status === 'confirmed').length
  const reviewed = issues.filter(issue => decisions[reviewKey(issue)]?.status && decisions[reviewKey(issue)].status !== 'pending').length
  const names = fileInfo?.sheets?.map(sheet => sheet.name) || [...new Set(issues.map(issue => issue.sheetName))]
  const sheets = names.length ? names : ['Sheet1']
  const failedFile = isBatch && !results ? batchFiles[Math.max(0, batchIndex)] : null
  const closeDrawer = (): void => { if (drawer.current?.open) drawer.current.close(); setDrawerOpen(false); reviewButton.current?.focus() }
  const anotherFile = (): void => { reset(); navigate('/audit') }
  const inspector = (issue: Issue): JSX.Element => {
    const decision = decisions[reviewKey(issue)] || { status: 'pending', note: '' }
    return <>
      <div className="aw-inspector-heading"><h2>{t('workspace.review')}</h2>{narrow && <button className="btn btn-ghost" type="button" onClick={closeDrawer}>{t('workspace.close')}</button>}</div>
      <div className="aw-location">{issue.sheetName}<strong>{issue.cell}</strong></div>
      <div className="aw-evidence-scroll">
      <section className="aw-evidence" aria-labelledby="rule-heading">
        <h3 id="rule-heading">{t('workspace.ruleEvidence')}</h3><p>{issue.message}</p>
        <dl><dt>{t('ruleId')}</dt><dd><code>{issue.ruleId}</code></dd></dl>
        <dl><dt>{t('formula')}</dt><dd><code data-testid="review-formula">{issue.formula || t('workspace.noFormula')}</code></dd></dl>
        <dl><dt>{t('workspace.cachedValue')}</dt><dd data-testid="review-cached-value">{observation(issue.currentValue, t('workspace.unknown'))}</dd></dl>
        <p className="aw-caveat">{t('workspace.notRecalculated')}</p>
        <dl><dt>{t('workspace.businessIntent')}</dt><dd>{t('workspace.unknown')}</dd></dl>
        {issue.suggestion && <><h4>{t('suggest')}</h4><p>{t(`suggestionOverrides.${issue.ruleId}`, { defaultValue: issue.suggestion })}</p></>}
      </section>
      <section className="aw-evidence" aria-labelledby="ai-heading"><h3 id="ai-heading">{t('aiReasoning')}</h3>
        <p data-testid="review-ai-status">{t(auditAiStatusKey(issue))}</p>
        {issue.llmReasoning && <p>{issue.llmReasoning}</p>}<p className="aw-caveat">{t('workspace.aiIsOpinion')}</p>
      </section>
      </div>
      <div className="aw-review-controls">
      <fieldset className="aw-decision" data-testid="review-decision"><legend>{t('workspace.humanDecision')}</legend>
        {STATUSES.map(status => <label key={status} className={decision.status === status ? 'chosen' : ''}><input type="radio" name="review-status" value={status} checked={decision.status === status} onChange={() => updateDecision(issue, { status })} />{t(`workspace.${status}`)}</label>)}
      </fieldset>
      <label className="aw-note">{t('workspace.note')}<textarea data-testid="review-note" rows={4} maxLength={4000} value={decision.note} onChange={event => updateDecision(issue, { note: event.target.value })} /></label>
      <p className="aw-caveat">{t('workspace.localDraft')}</p>
      </div>
    </>
  }
  return <div className="aw-workspace" data-testid="audit-workspace">
    {isBatch && <div className="batch-tabs aw-batch" role="group" aria-label={t('workspace.files')}>{batchFiles.map((file, index) => <button type="button" key={file.path} className={`batch-tab ${index === batchIndex ? 'active' : ''}`} data-testid={`results-batch-tab-${index}`} onClick={() => selectBatchFile(index)}>{file.name}{file.status === 'error' && <AlertIcon size={12} />}</button>)}</div>}
    <div className="aw-filebar"><FileSpreadsheetIcon size={20} /><div className="aw-filetitle"><h2>{results?.fileName || failedFile?.name || t('workspace.review')}</h2><span>{t('workspace.reviewCount', { reviewed, total: issues.length, confirmed })}</span></div>
      {narrow && selected && <button className="btn btn-ghost" ref={reviewButton} type="button" data-testid="review-open" onClick={() => setDrawerOpen(true)}>{t('workspace.review')}</button>}
      <button className="btn btn-ghost" type="button" data-testid="results-rescan-btn" onClick={anotherFile}>{t('workspace.anotherFile')}</button>
    </div>
    {(scanState === 'scanning' || scanState === 'cancelling' || stopRetryRequired) && <div className="aw-progress" role="status"><span>{stopRetryRequired ? error : t('workspace.aiInProgress')}</span>{progress.auditReview && <AuditReviewProgressNotice review={progress.auditReview} />}<button className="btn btn-ghost" type="button" data-testid="workspace-cancel" disabled={scanState === 'cancelling'} onClick={() => void cancelScan()}>{t(stopRetryRequired ? 'workspace.retryStop' : 'workspace.stopAi')}</button></div>}
    {draftError && <div className="aw-feedback" role="alert">{t('workspace.draftFailed')} <button type="button" className="btn btn-ghost" onClick={retrySave}>{t('workspace.retry')}</button></div>}
    {failedFile ? <div className="aw-empty" role="alert"><h3>{failedFile.name}</h3><p>{failedFile.error || error}</p><button className="btn btn-ghost" onClick={anotherFile}>{t('workspace.anotherFile')}</button></div> : <div className="aw-columns">
      <aside className="aw-queue" data-testid="results-panel-left" aria-label={t('workspace.findings')}>
        <div className="aw-queue-title"><h2>{t('workspace.findings')}</h2><span>{issues.length}</span></div>
        <div className="aw-filters"><label>{t('workspace.reviewStatus')}<select data-testid="review-filter" value={reviewFilter} onChange={event => setReviewFilter(event.target.value as ReviewFilter)}><option value="all">{t('filterAll')}</option>{STATUSES.map(status => <option key={status} value={status}>{t(`workspace.${status}`)}</option>)}</select></label>
          <label>{t('workspace.severity')}<select data-testid="severity-filter" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">{t('filterAll')}</option><option value="error">{t('crit')}</option><option value="warning">{t('warn')}</option><option value="info">{t('info')}</option></select></label></div>
        <div className="aw-issue-list">{filtered.map((issue, index) => <button type="button" key={reviewKey(issue)} data-testid={`results-issue-card-${index}`} data-rule-id={issue.ruleId} data-sheet-name={issue.sheetName} data-cell-address={issue.cell} className={`aw-issue ${selected === issue ? 'selected' : ''}`} aria-pressed={selected === issue} onClick={() => setSelectedKey(reviewKey(issue))}>
          <span className="aw-issue-meta"><strong>{issue.cell}</strong><span>{issue.sheetName}</span><span className={`aw-severity ${issue.severity}`}>{t(issue.severity === 'error' ? 'crit' : issue.severity === 'warning' ? 'warn' : 'info')}</span></span><span className="aw-issue-message">{issue.message}</span><span className="aw-issue-state">{t(`workspace.${decisions[reviewKey(issue)]?.status || 'pending'}`)}</span>
        </button>)}{!filtered.length && <div className="aw-empty"><h3>{t(issues.length ? 'workspace.noMatching' : 'allClear')}</h3><p>{t(issues.length ? 'workspace.changeFilter' : 'noIssuesMsg')}</p></div>}</div>
      </aside>
      <main className="aw-sheet" data-testid="results-panel-right"><div className="aw-formula-bar"><span>{selected?.cell || '—'}</span><code>{selected?.formula || t('workspace.selectFinding')}</code></div><SpreadsheetPreview issues={issues} selectedIssue={selected} sheets={sheets} filePath={results?.filePath || ''} sourceFingerprint={results?.sourceFingerprint} onSelectIssue={issue => setSelectedKey(reviewKey(issue))} /></main>
      {!narrow && <aside className="aw-inspector" data-testid="review-inspector">{selected ? inspector(selected) : <div className="aw-empty"><p>{t('workspace.selectFinding')}</p></div>}</aside>}
    </div>}
    {narrow && drawerOpen && selected && <dialog className="aw-drawer" ref={drawer} onCancel={event => { event.preventDefault(); closeDrawer() }} onClose={closeDrawer} data-testid="review-inspector">{inspector(selected)}</dialog>}
  </div>
}
