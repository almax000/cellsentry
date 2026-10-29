import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScan } from '../context/ScanContext'
import { useAuditWorkspace } from '../context/AuditWorkspaceContext'
import { buildAuditSnapshot } from '../../shared/auditWorkspace'
import { ExportIcon } from './icons'
import type { AuditExportFormat, AuditExportScope } from '../../shared/export'
import './ExportButton.css'

export default function ExportButton(): JSX.Element {
  const { t } = useTranslation('results')
  const { results } = useScan()
  const { decisions } = useAuditWorkspace()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<AuditExportScope>('all')
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (open) dialog.current?.showModal() }, [open])
  const close = (): void => { if (!exporting) { dialog.current?.close(); setOpen(false); opener.current?.focus() } }
  const request = results ? { filePath: results.filePath, fileName: results.fileName, format: 'html' as AuditExportFormat, issues: results.issues, totalFindings: results.issues.length, sourceFingerprint: results.sourceFingerprint, reviewDecisions: decisions, scope, auditReview: results.auditReview } : null
  const snapshot = request ? buildAuditSnapshot(request) : null
  const handleExport = async (format: AuditExportFormat): Promise<void> => {
    if (!request || !window.api?.exportAudit) return
    setExporting(true); setFeedback(null)
    try {
      const result = await window.api.exportAudit({ ...request, format })
      if (result.cancelled) { setFeedback({ type:'success', message:t('workspace.exportCancelled') }); return }
      setFeedback({ type:result.success ? 'success' : 'error', message:result.success ? t('exportSavedTo', { path:result.outputPath }) : result.error || t('exportFailed') })
    } catch { setFeedback({ type:'error', message:t('exportFailed') }) }
    finally { setExporting(false) }
  }
  return <div className="export-wrapper">
    <button ref={opener} type="button" className="btn btn-ghost" data-testid="export-btn" disabled={!results || exporting} onClick={() => { setScope('all'); setFeedback(null); setOpen(true) }}><ExportIcon size={13} />{t('exportReport')}</button>
    {open && snapshot && <dialog className="audit-export-dialog" ref={dialog} onCancel={event => { event.preventDefault(); close() }} data-testid="export-dropdown" aria-labelledby="export-preview-title">
      <div className="audit-export-heading"><h2 id="export-preview-title">{t('workspace.reportPreview')}</h2><button type="button" className="btn btn-ghost" disabled={exporting} onClick={close}>{t('workspace.close')}</button></div>
      <p className="audit-export-file">{results?.fileName}</p>
      <label className="audit-export-scope">{t('workspace.scope')}<select data-testid="export-scope" disabled={exporting} value={scope} onChange={event => setScope(event.target.value as AuditExportScope)}><option value="all">{t('workspace.allFindings')}</option><option value="confirmed">{t('workspace.confirmedOnly')}</option></select></label>
      <p data-testid="export-scope-summary">{t('workspace.excluded', { included:snapshot.exportedFindings, excluded:snapshot.excludedFindings })}</p>
      <div className="audit-export-table"><table><thead><tr><th>{t('source')}</th><th>{t('workspace.ruleEvidence')}</th><th>{t('workspace.humanDecision')}</th><th>{t('workspace.note')}</th></tr></thead><tbody>{snapshot.rows.map(row => <tr key={row.reviewKey}><td>{row.sheetName}!{row.cell}</td><td>{row.rule.message}<code>{row.rule.formula}</code></td><td>{t(`workspace.${row.review.status}`)}</td><td>{row.review.note || '—'}</td></tr>)}</tbody></table>{!snapshot.rows.length && <p>{t('workspace.noReportRows')}</p>}</div>
      <p className="audit-export-caveat">{t('workspace.copyCaveat')}</p>
      <div className="audit-export-actions">{(['html','pdf','xlsx'] as const).map(format => <button key={format} type="button" className="btn btn-primary" data-testid={`export-${format}`} disabled={exporting || (format === 'xlsx' && !results?.filePath.toLowerCase().endsWith('.xlsx'))} onClick={() => void handleExport(format)}>{t(exporting ? 'exporting' : format === 'html' ? 'htmlReport' : format === 'pdf' ? 'pdfReport' : 'markedWorkbook')}</button>)}</div>
      {feedback && <div className={`export-feedback ${feedback.type}`} role="status">{feedback.message}</div>}
    </dialog>}
  </div>
}
