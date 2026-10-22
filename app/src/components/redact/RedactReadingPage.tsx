import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OCR_ENABLED } from '../../../shared/redact'
import { useRedact, type ReadingFile } from '../../redact/RedactContext'
import RedactSteps from './RedactSteps'
import './Redact.css'

function statusText(file: ReadingFile, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (file.status === 'queued') return t('reading.queued')
  if (file.status === 'error') return t('reading.failed')
  if (file.status === 'done') return t(file.source === 'ocr' ? 'reading.doneOcr' : 'reading.done', { count: file.pages || file.page })
  if (file.kind === 'image') return t('reading.progressImage')
  return t(file.source === 'ocr' ? 'reading.progressOcr' : 'reading.progressText', { page: Math.max(file.page, 1), pages: Math.max(file.pages, 1) })
}

/** Wording that names text recognition only while it is on (ADR-0013). */
const OCR_CONTEXT = { context: OCR_ENABLED ? 'ocr' : undefined }

/** 1, 2, 3, 5 → 1–3、5: a scanned PDF of thirty pages is one line, not thirty. */
function pageRanges(pages: number[], separator: string): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let index = 0; index < sorted.length; index++) {
    const first = sorted[index]
    while (index + 1 < sorted.length && sorted[index + 1] === sorted[index] + 1) index++
    parts.push(sorted[index] === first ? String(first) : `${first}\u2013${sorted[index]}`)
  }
  return parts.join(separator)
}

/** One line per kind of problem in a file, with the pages it happened on. */
function groupErrors(errors: ReadingFile['errors']): Array<{ code: ReadingFile['errors'][number]['code']; pages: number[] }> {
  const groups: Array<{ code: ReadingFile['errors'][number]['code']; pages: number[] }> = []
  for (const error of errors) {
    let group = groups.find((item) => item.code === error.code)
    if (!group) {
      group = { code: error.code, pages: [] }
      groups.push(group)
    }
    if (error.page !== undefined) group.pages.push(error.page)
  }
  return groups
}

/** Per-file, per-page progress. Errors stay on screen; nothing jumps away on its own. */
export default function RedactReadingPage(): JSX.Element {
  const { t, i18n } = useTranslation('redact')
  const separator = i18n.language?.startsWith('zh') ? '\u3001' : ', '
  const navigate = useNavigate()
  const { stage, files, failure, cancelRead, continueAfterRead, reset } = useRedact()
  const advanced = useRef(false)

  const anyErrors = files.some((file) => file.status === 'error' || file.errors.length > 0)
  const anyText = files.some((file) => file.status === 'done')
  const finished = stage === 'read'
  const stopping = stage === 'stopping'

  useEffect(() => {
    // A clean read goes straight to review; anything else waits for the user.
    if (!finished || failure || anyErrors || !anyText || advanced.current) return
    advanced.current = true
    void continueAfterRead().then(() => navigate('/redact/review'))
  }, [anyErrors, anyText, continueAfterRead, failure, finished, navigate])

  if (stage === 'idle') return <Navigate to="/pii" replace />

  const goOn = async (): Promise<void> => {
    await continueAfterRead()
    navigate('/redact/review')
  }

  return (
    <div className="redact-page view-enter" data-testid="redact-reading">
      <RedactSteps current="files" />
      <section className="redact-card">
        <h2 className="redact-card-title">{finished ? t('reading.titleDone') : t('reading.title', { count: files.length })}</h2>
        <p className="redact-note redact-local">{t('reading.local', OCR_CONTEXT)}</p>
        <ul className="redact-files">
          {files.map((file, index) => (
            <li key={`${file.path}-${index}`} className={`redact-file ${file.status}`} data-testid={`redact-file-${index}`} data-status={file.status}>
              <span className="redact-file-kind">{file.kind === 'image' ? t('reading.image') : t('reading.pdf')}</span>
              <span className="redact-file-name">{file.name}</span>
              <span className="redact-file-status">{statusText(file, t)}</span>
              {file.errors.length > 0 && (
                <ul className="redact-file-errors">
                  {groupErrors(file.errors).map((group) => (
                    <li key={group.code} data-testid="redact-file-error" data-code={group.code}>
                      {group.pages.length > 0 ? `${t('reading.page', { page: pageRanges(group.pages, separator) })} · ` : ''}{t(`reading.errors.${group.code}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {stopping && <p className="redact-note" role="status" data-testid="redact-read-stopping">{t('reading.stopping')}</p>}
        {failure && <p className="redact-alert" role="alert" data-testid="redact-read-failure">{t(`reading.failures.${failure}`, OCR_CONTEXT)}</p>}
        {finished && !failure && !anyText && <p className="redact-alert" role="alert">{t('reading.noText', OCR_CONTEXT)}</p>}
        <p className="redact-note">{t('reading.errorStays')}</p>
        <div className="redact-actions">
          {!finished && (
            <button type="button" className="btn btn-ghost" disabled={stopping} onClick={cancelRead} data-testid="redact-read-cancel">{t('reading.cancel')}</button>
          )}
          {finished && (
            <button type="button" className="btn btn-ghost" onClick={() => { reset(); navigate('/pii') }} data-testid="redact-read-back">
              {t('reading.back')}
            </button>
          )}
          {finished && anyText && (anyErrors || failure) && (
            <button type="button" className="btn btn-primary" onClick={() => void goOn()} data-testid="redact-read-continue">
              {t('reading.continueSkipping')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
