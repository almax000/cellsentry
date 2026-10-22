import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import { useScan } from '../context/ScanContext'
import { useTaskStarter, type PickedFile } from '../hooks/useTaskStarter'
import { useRedact } from '../redact/RedactContext'
import {
  TASKS, TASK_ORDER, classifyFileName, classifyMimeType, taskForRoute,
  type DropKind, type TaskId,
} from '../tasks'
import { TaskIcon } from './icons/taskIcons'
import { OCR_ENABLED } from '../../shared/redact'
import './FileDropRouter.css'

type HoverKind = DropKind | 'unknown'
type NoticeKind = 'mixed' | 'unsupported' | 'notReady'
interface Hover { kind: HoverKind; count: number }

/** Best guess at what is being dragged. File names are hidden until drop, so use MIME types. */
function hoverOf(dataTransfer: DataTransfer | null): Hover {
  const items = dataTransfer ? Array.from(dataTransfer.items).filter((item) => item.kind === 'file') : []
  const count = items.length
  if (count === 0) return { kind: 'unknown', count }
  const kinds = items.map((item) => classifyMimeType(item.type))
  if (kinds.some((kind) => kind === null)) return { kind: 'unknown', count }
  if (kinds.includes('spreadsheet')) return { kind: 'spreadsheet', count }
  return { kind: kinds.every((kind) => kind === 'document') ? 'document' : 'unsupported', count }
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Window-wide file drop. PDFs and photos always go to redaction. A dropped
 * spreadsheet goes to the right task: straight in on a task entry page,
 * otherwise via a small chooser.
 */
export default function FileDropRouter(): JSX.Element | null {
  const { t } = useTranslation('home')
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useSidecar()
  const { stage: redactStage, startFiles } = useRedact()
  const { scanState } = useScan()
  const startTask = useTaskStarter()
  const [hover, setHover] = useState<Hover | null>(null)
  const [notice, setNotice] = useState<NoticeKind | null>(null)
  const [chooser, setChooser] = useState<PickedFile[] | null>(null)
  // Documents dropped while a redaction round holds a code list wait for a confirmation.
  const [pendingDocs, setPendingDocs] = useState<{ documents: PickedFile[]; mixed: boolean } | null>(null)
  const depth = useRef(0)
  const dialogRef = useRef<HTMLDivElement>(null)

  const busy = scanState === 'scanning' || location.pathname === '/scanning' || redactStage === 'reading' || redactStage === 'stopping'
  const entryTask = taskForRoute(location.pathname)

  const route = useCallback((files: PickedFile[], documents: PickedFile[]) => {
    setNotice(null)
    if (documents.length > 0) {
      if (redactStage !== 'idle') {
        setPendingDocs({ documents, mixed: files.length > 0 })
        return
      }
      startFiles(documents.map((file) => ({ path: file.path, name: file.name })))
      navigate('/redact/read')
      if (files.length > 0) setNotice('mixed')
      return
    }
    if (files.length === 0) {
      setNotice('unsupported')
      return
    }
    if (status !== 'connected') {
      setNotice('notReady')
      return
    }
    if (entryTask && (files.length === 1 || entryTask.allowsBatch)) {
      startTask(entryTask.id, files)
      return
    }
    setChooser(files)
  }, [status, entryTask, startTask, startFiles, navigate, redactStage])

  const confirmPending = (): void => {
    if (!pendingDocs) return
    startFiles(pendingDocs.documents.map((file) => ({ path: file.path, name: file.name })))
    navigate('/redact/read')
    if (pendingDocs.mixed) setNotice('mixed')
    setPendingDocs(null)
  }

  useEffect(() => {
    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current += 1
      if (!busy) setHover(hoverOf(event.dataTransfer))
    }
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
    }
    const onDragLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      depth.current = event.relatedTarget === null ? 0 : Math.max(0, depth.current - 1)
      if (depth.current === 0) setHover(null)
    }
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      // Always swallow file drops so Electron never navigates to the file.
      event.preventDefault()
      depth.current = 0
      setHover(null)
      if (busy) return
      const picked: PickedFile[] = []
      const documents: PickedFile[] = []
      for (const file of Array.from(event.dataTransfer?.files ?? [])) {
        const kind = classifyFileName(file.name)
        if (kind === 'unsupported') continue
        const path = window.api?.getFilePathFromDrop?.(file) ?? ''
        if (path) (kind === 'document' ? documents : picked).push({ path, name: file.name, size: file.size })
      }
      route(picked, documents)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return (): void => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [busy, route])

  // Test-mode seam: synthetic drops carry no file path, so e2e tests post real paths here.
  useEffect(() => {
    if (!window.__TEST_API__) return
    const onTestDrop = (event: Event): void => {
      if (busy) return
      const files = (event as CustomEvent<{ files: PickedFile[] }>).detail?.files ?? []
      const spreadsheets = files.filter((file) => classifyFileName(file.name) === 'spreadsheet')
      route(spreadsheets, files.filter((file) => classifyFileName(file.name) === 'document'))
    }
    window.addEventListener('cellsentry:test-drop', onTestDrop)
    return (): void => window.removeEventListener('cellsentry:test-drop', onTestDrop)
  }, [busy, route])

  // Once the round is gone (started over elsewhere) there is nothing left to confirm.
  useEffect(() => {
    if (redactStage === 'idle') setPendingDocs(null)
  }, [redactStage])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return (): void => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!chooser) return
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = (): HTMLElement[] =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
    focusable()[0]?.focus()
    // Capture so Escape and Tab stay with the chooser and never reach a dialog underneath.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setChooser(null)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const index = items.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length
      event.preventDefault()
      items[next].focus()
    }
    window.addEventListener('keydown', onKey, true)
    return (): void => {
      window.removeEventListener('keydown', onKey, true)
      returnFocus?.focus()
    }
  }, [chooser])

  const choose = (task: TaskId): void => {
    if (!chooser) return
    const files = chooser
    setChooser(null)
    startTask(task, files)
  }

  // Hints name photos only while text recognition is on (ADR-0013).
  const ocr = { context: OCR_ENABLED ? 'ocr' : undefined }
  const hoverText = ({ kind, count }: Hover): { title: string; hint: string } => {
    if (kind === 'document') return { title: t('drop.document'), hint: t('drop.documentHint', ocr) }
    if (kind === 'unsupported') return { title: t('drop.unsupported'), hint: t('drop.unsupportedHint', ocr) }
    if (entryTask && (count <= 1 || entryTask.allowsBatch)) return { title: t('drop.task', { task: t(`tasks.${entryTask.id}.title`) }), hint: t('drop.unknownHint', ocr) }
    if (kind === 'spreadsheet') return { title: t('drop.spreadsheet'), hint: t('drop.spreadsheetHint') }
    return { title: t('drop.unknown'), hint: t('drop.unknownHint', ocr) }
  }

  const noticeText = (kind: NoticeKind): { title: string; hint?: string } => {
    if (kind === 'mixed') return { title: t('drop.mixed'), hint: t('drop.mixedHint', ocr) }
    if (kind === 'unsupported') return { title: t('drop.unsupported'), hint: t('drop.unsupportedHint', ocr) }
    return { title: t('drop.notReady') }
  }

  const many = (chooser?.length ?? 0) > 1

  return (
    <>
      {hover && (
        <div className={`drop-overlay kind-${hover.kind}`} data-testid="drop-overlay" data-kind={hover.kind}>
          <div className="drop-overlay-card">
            <div className="drop-overlay-title">{hoverText(hover).title}</div>
            <div className="drop-overlay-hint">{hoverText(hover).hint}</div>
          </div>
        </div>
      )}

      {notice && (
        <div className="drop-notice" role="status" data-testid="drop-notice" data-kind={notice}>
          <div>
            <div className="drop-notice-title">{noticeText(notice).title}</div>
            {noticeText(notice).hint && <div className="drop-notice-hint">{noticeText(notice).hint}</div>}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setNotice(null)}>{t('drop.dismiss')}</button>
        </div>
      )}

      {pendingDocs && (
        <div className="drop-notice" role="alert" data-testid="drop-confirm-new">
          <div>
            <div className="drop-notice-title">{t('drop.confirmNew')}</div>
            <div className="drop-notice-hint">{t('drop.confirmNewHint')}</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={confirmPending} data-testid="drop-confirm-new-yes">{t('drop.confirmNewYes')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingDocs(null)}>{t('chooser.cancel')}</button>
        </div>
      )}

      {chooser && (
        <div
          className="drop-chooser-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setChooser(null) }}
        >
          <div
            ref={dialogRef}
            className="drop-chooser"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drop-chooser-title"
            data-testid="drop-chooser"
          >
            <div className="drop-chooser-title" id="drop-chooser-title">
              {many ? t('chooser.titleMany', { count: chooser.length }) : t('chooser.title')}
            </div>
            <div className="drop-chooser-file">{chooser.map((file) => file.name).join(' · ')}</div>
            <div className="drop-chooser-options">
              {TASK_ORDER.map((id) => {
                const disabled = many && !TASKS[id].allowsBatch
                return (
                  <button
                    key={id}
                    type="button"
                    className="drop-chooser-option"
                    data-testid={`drop-chooser-${id}`}
                    disabled={disabled}
                    onClick={() => choose(id)}
                  >
                    <TaskIcon task={id} size={20} />
                    <span className="drop-chooser-option-title">{t(`tasks.${id}.title`)}</span>
                    <span className="drop-chooser-option-desc">{t(`tasks.${id}.desc`)}</span>
                  </button>
                )
              })}
            </div>
            {many && <div className="drop-chooser-hint">{t('chooser.manyHint')}</div>}
            <div className="drop-chooser-actions">
              <button type="button" className="btn btn-ghost" data-testid="drop-chooser-cancel" onClick={() => setChooser(null)}>
                {t('chooser.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
