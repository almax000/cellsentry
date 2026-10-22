import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../../hooks/useSidecar'
import { useTaskStarter } from '../../hooks/useTaskStarter'
import { useRedact } from '../../redact/RedactContext'
import { OCR_ENABLED } from '../../../shared/redact'
import MyInfoPanel from './MyInfoPanel'
import RedactSteps from './RedactSteps'
import './Redact.css'

const fileName = (path: string): string => path.split(/[/\\]/).pop() || path

/** Redaction entry: "My info" on the left, files or pasted text on the right. */
export default function RedactEntryPage(): JSX.Element {
  const { t } = useTranslation('redact')
  const navigate = useNavigate()
  const { status, openFileDialog } = useSidecar()
  const startTask = useTaskStarter()
  const { stage, startFiles, startText } = useRedact()
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [notice, setNotice] = useState('')
  // A round in progress holds the only copy of its code list, so starting over asks first.
  // The choice is kept as a kind, not a closure, so confirming uses the current "My info" and text.
  const [confirmNew, setConfirmNew] = useState<'files' | 'paste' | null>(null)
  const active = stage !== 'idle'

  const chooseFiles = async (): Promise<void> => {
    const paths = await window.api?.redact?.openDocuments()
    if (!paths || paths.length === 0) return
    startFiles(paths.map((path) => ({ path, name: fileName(path) })))
    navigate('/redact/read')
  }

  const startPasted = async (): Promise<void> => {
    if (!pasted.trim()) return
    await startText(pasted, t('entry.pastedName'))
    navigate('/redact/review')
  }

  const run = (kind: 'files' | 'paste'): void => {
    if (kind === 'files') void chooseFiles()
    else void startPasted()
  }
  const guard = (kind: 'files' | 'paste'): void => {
    if (active) setConfirmNew(kind)
    else run(kind)
  }

  const chooseSpreadsheet = async (): Promise<void> => {
    if (status !== 'connected') {
      setNotice(t('entry.notReady'))
      return
    }
    const path = await openFileDialog()
    if (path) startTask('pii', [{ path, name: fileName(path), size: 0 }])
  }

  return (
    <div className="redact-page view-enter" data-testid="entry-pii">
      <RedactSteps current="files" />
      {active && (
        <div className="redact-alert redact-round" role="status" data-testid="redact-round-active">
          <span>{t('entry.roundActive')}</span>
          <button type="button" className="redact-link" onClick={() => navigate(stage === 'ready' ? '/redact/review' : '/redact/read')} data-testid="redact-back-to-round">
            {t('entry.backToRound')}
          </button>
        </div>
      )}
      {confirmNew && (
        <div className="redact-alert redact-round" role="alert" data-testid="redact-confirm-new">
          <span>{t('entry.confirmNew')}</span>
          <button type="button" className="btn btn-secondary" onClick={() => { const kind = confirmNew; setConfirmNew(null); run(kind) }} data-testid="redact-confirm-new-yes">
            {t('entry.confirmNewYes')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmNew(null)}>{t('entry.cancel')}</button>
        </div>
      )}
      <div className="redact-entry-grid">
        <MyInfoPanel />
        <section className="redact-drop" data-testid="redact-drop">
          <div className="redact-drop-box">
            <h2 className="redact-drop-title">{t('entry.dropTitle')}</h2>
            <p className="redact-drop-hint">{t('entry.dropHint', { context: OCR_ENABLED ? 'ocr' : undefined })}</p>
            <div className="redact-drop-actions">
              <button type="button" className="btn btn-primary" onClick={() => guard('files')} data-testid="redact-choose-files">
                {t('entry.chooseFiles')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPasting((value) => !value)} data-testid="redact-paste-toggle">
                {t('entry.pasteText')}
              </button>
            </div>
          </div>

          {pasting && (
            <div className="redact-paste" data-testid="redact-paste">
              <label className="redact-paste-label" htmlFor="redact-paste-input">{t('entry.pasteTitle')}</label>
              <textarea id="redact-paste-input" value={pasted} rows={8} placeholder={t('entry.pastePlaceholder')} spellCheck={false}
                onChange={(event) => setPasted(event.target.value)} data-testid="redact-paste-input" />
              <div className="redact-paste-actions">
                <button type="button" className="btn btn-ghost" onClick={() => { setPasting(false); setPasted('') }}>{t('entry.cancel')}</button>
                <button type="button" className="btn btn-primary" disabled={!pasted.trim()} onClick={() => guard('paste')} data-testid="redact-paste-start">
                  {t('entry.pasteStart')}
                </button>
              </div>
            </div>
          )}

          <p className="redact-note">{t('entry.whyMany')}</p>
          <p className="redact-note redact-local">{t('entry.local', { context: OCR_ENABLED ? 'ocr' : undefined })}</p>
          {notice && <p className="redact-alert" role="status">{notice}</p>}
          <p className="redact-spreadsheet">
            {t('entry.spreadsheet')}{' '}
            <button type="button" className="redact-link" onClick={() => void chooseSpreadsheet()} data-testid="redact-spreadsheet">
              {t('entry.spreadsheetAction')}
            </button>
          </p>
        </section>
      </div>
    </div>
  )
}
