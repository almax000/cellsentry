import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSidecar } from '../hooks/useSidecar'
import { useScan } from '../context/ScanContext'
import { useTaskStarter, type PickedFile } from '../hooks/useTaskStarter'
import {
  classifyFileName, classifyMimeType,
  type DropKind,
} from '../tasks'
import './FileDropRouter.css'

type HoverKind = DropKind | 'unknown'
type NoticeKind = 'unsupported' | 'notReady'
interface Hover { kind: HoverKind; count: number }

/** Best guess at what is being dragged. File names are hidden until drop, so use MIME types. */
function hoverOf(dataTransfer: DataTransfer | null): Hover {
  const items = dataTransfer ? Array.from(dataTransfer.items).filter((item) => item.kind === 'file') : []
  const count = items.length
  if (count === 0) return { kind: 'unknown', count }
  const kinds = items.map((item) => classifyMimeType(item.type))
  if (kinds.some((kind) => kind === null)) return { kind: 'unknown', count }
  if (kinds.every((kind) => kind === 'spreadsheet')) return { kind: 'spreadsheet', count }
  return { kind: 'unsupported', count }
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Window-wide workbook drop. CellSentry accepts spreadsheets only.
 */
export default function FileDropRouter(): JSX.Element | null {
  const { t } = useTranslation('home')
  const location = useLocation()
  const { status } = useSidecar()
  const { scanState } = useScan()
  const startTask = useTaskStarter()
  const [hover, setHover] = useState<Hover | null>(null)
  const [notice, setNotice] = useState<NoticeKind | null>(null)
  const depth = useRef(0)

  const busy = scanState === 'scanning' || location.pathname === '/scanning'

  const route = useCallback((files: PickedFile[]) => {
    setNotice(null)
    if (files.length === 0) {
      setNotice('unsupported')
      return
    }
    if (status !== 'connected') {
      setNotice('notReady')
      return
    }
    startTask('audit', files)
  }, [status, startTask])

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
      const dropped = Array.from(event.dataTransfer?.files ?? [])
      if (dropped.some((file) => classifyFileName(file.name) !== 'spreadsheet')) {
        route([])
        return
      }
      const picked: PickedFile[] = []
      for (const file of dropped) {
        const path = window.api?.getFilePathFromDrop?.(file) ?? ''
        if (path) picked.push({ path, name: file.name, size: file.size })
      }
      route(picked)
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
      route(files.every((file) => classifyFileName(file.name) === 'spreadsheet') ? files : [])
    }
    window.addEventListener('cellsentry:test-drop', onTestDrop)
    return (): void => window.removeEventListener('cellsentry:test-drop', onTestDrop)
  }, [busy, route])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return (): void => clearTimeout(timer)
  }, [notice])

  const hoverText = ({ kind }: Hover): { title: string; hint: string } => {
    if (kind === 'unsupported') return { title: t('drop.unsupported'), hint: t('drop.unsupportedHint') }
    if (kind === 'spreadsheet') return { title: t('drop.spreadsheet'), hint: t('drop.spreadsheetHint') }
    return { title: t('drop.unknown'), hint: t('drop.unknownHint') }
  }

  const noticeText = (kind: NoticeKind): { title: string; hint?: string } => {
    if (kind === 'unsupported') return { title: t('drop.unsupported'), hint: t('drop.unsupportedHint') }
    return { title: t('drop.notReady') }
  }

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

    </>
  )
}
