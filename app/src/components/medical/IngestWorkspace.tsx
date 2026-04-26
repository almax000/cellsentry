/**
 * Ingest + Mapping workspace — v2 main work surface (W3 Step 3.6).
 *
 * Spec: `_design/v2/screen-1-ingest-mapping.md`. This is screen 1 of 4 in the
 * v2 medical pseudonymization flow:
 *   1. Ingest + Mapping     ← this file
 *   2. Collision warning    ← CollisionWarningPanel.tsx (renders when collisions found)
 *   3. Redaction preview    ← W4
 *   4. Safety-net review    ← W4
 *
 * State:
 *   - queue: files dropped + their status pills
 *   - mappingText: live YAML being edited; saved on blur
 *   - dateMode: A/B/C radio per spec (AD4)
 *   - collisions: when populated, blocks pipeline + shows CollisionWarningPanel
 *
 * Pipeline orchestrator integration is W4 (orchestrator.ts still throws TODO);
 * this UI works against the medical:scan-collisions IPC for the pre-flight
 * gate, and stubs the actual redact/preview as "coming in W4."
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import MappingEditor from './MappingEditor'
import DateModeSelector from './DateModeSelector'
import CollisionWarningPanel from './CollisionWarningPanel'
import './IngestWorkspace.css'

type DateMode = 'preserve' | 'offset_days' | 'bucket_month'

interface QueueItem {
  path: string
  status: 'ready' | 'running' | 'done' | 'error'
}

interface CollisionWarning {
  longer: string
  shorter: string
  contexts: string[]
}

const DEFAULT_MAPPING = `# CellSentry pseudonym map
# Manage via the CellSentry app or hand-edit; the app respects manual changes.
version: 1
next_pseudonym_index: 0
patients: []
`

export default function IngestWorkspace(): JSX.Element {
  const { t } = useTranslation('medical')

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [mappingText, setMappingText] = useState(DEFAULT_MAPPING)
  const [dateMode, setDateMode] = useState<DateMode>('preserve')
  const [offsetDays, setOffsetDays] = useState(30)
  const [collisions, setCollisions] = useState<CollisionWarning[] | null>(null)
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null)

  // ── File drop / browse ──────────────────────────────────────────────────
  const handleBrowse = async (): Promise<void> => {
    const paths = await window.api?.openFilesDialog?.()
    if (!paths || paths.length === 0) return
    setQueue(prev => [
      ...prev,
      ...paths.filter(p => !prev.some(q => q.path === p)).map(path => ({ path, status: 'ready' as const })),
    ])
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    if (!window.api?.getFilePathFromDrop) return
    const paths = Array.from(e.dataTransfer.files)
      .map(f => window.api.getFilePathFromDrop(f))
      .filter(Boolean)
    if (paths.length === 0) return
    setQueue(prev => [
      ...prev,
      ...paths.filter(p => !prev.some(q => q.path === p)).map(path => ({ path, status: 'ready' as const })),
    ])
  }

  const handleRemove = (path: string): void => {
    setQueue(prev => prev.filter(q => q.path !== path))
  }

  // ── Run pipeline (with collision pre-scan gate) ─────────────────────────
  const canRun = queue.length > 0 && mappingText.trim().length > 0

  const runPipeline = async (): Promise<void> => {
    setPipelineMessage(t('pipeline.scanningCollisions'))
    setCollisions(null)

    // Persist mapping first so the IPC handler can read it from disk.
    // For W3 we just ship the text directly to the IPC — the orchestrator
    // path that reads from disk is W4. Here we route through medical:scan-collisions
    // which today calls a stub.
    try {
      // The IPC handler signature is (mappingPath, chunks). For now we don't
      // have a chunked OCR result wired; the chunks are the mapping text
      // itself for self-test, plus we'd add the actual file contents in W4.
      const chunks: string[] = queue.map(q => q.path) // stub — real file read in W4
      const result = await window.api?.medical?.scanCollisions?.('', chunks)

      if (result && 'error' in result) {
        setPipelineMessage(t('pipeline.error', { msg: result.error }))
        return
      }

      const cs = (result ?? []) as CollisionWarning[]
      if (cs.length > 0) {
        setCollisions(cs)
        setPipelineMessage(null)
        return
      }

      // No collisions — would call medical:redact next. W4.
      setPipelineMessage(t('pipeline.todoW4'))
    } catch (e) {
      setPipelineMessage(t('pipeline.error', { msg: String(e) }))
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && canRun) {
        e.preventDefault()
        runPipeline()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canRun]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="ingest-workspace view-enter">
      <header className="ingest-header">
        <h1 className="ingest-title">{t('workspace.title')}</h1>
        <button
          className="ingest-run-cta"
          onClick={runPipeline}
          disabled={!canRun}
          aria-disabled={!canRun}
          aria-describedby={!canRun ? 'run-disabled-reason' : undefined}
          data-testid="run-pipeline-cta"
        >
          {t('workspace.runCta')}
        </button>
      </header>

      <div className="ingest-panes">
        {/* Left pane — drop zone + queue */}
        <section className="ingest-left">
          <div
            className="ingest-dropzone"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={handleBrowse}
            role="button"
            tabIndex={0}
            aria-label={t('dropzone.aria')}
            data-testid="ingest-dropzone"
          >
            <div className="ingest-dropzone-icon">📥</div>
            <div className="ingest-dropzone-title">{t('dropzone.title')}</div>
            <div className="ingest-dropzone-subtitle">{t('dropzone.subtitle')}</div>
            <div className="ingest-dropzone-formats">
              {['.pdf', '.jpg', '.png', '.heic', '.txt'].map(ext => (
                <span key={ext} className="format-badge">{ext}</span>
              ))}
            </div>
          </div>

          {queue.length > 0 && (
            <ul className="ingest-queue" data-testid="ingest-queue" aria-label={t('queue.aria')}>
              {queue.map(item => (
                <li
                  key={item.path}
                  className={`ingest-queue-item status-${item.status}`}
                  data-testid={`ingest-queue-item`}
                >
                  <span className="queue-path">{item.path.split('/').pop()}</span>
                  <span className="queue-status">{t(`queue.status.${item.status}`)}</span>
                  <button
                    className="queue-remove"
                    onClick={() => handleRemove(item.path)}
                    aria-label={t('queue.remove', { name: item.path.split('/').pop() })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right pane — mapping editor + date mode */}
        <section className="ingest-right">
          <div className="mapping-editor-wrap">
            <MappingEditor value={mappingText} onChange={setMappingText} />
          </div>

          <div className="ingest-date-mode">
            <DateModeSelector
              mode={dateMode}
              onChange={setDateMode}
              offsetDays={offsetDays}
              onOffsetChange={setOffsetDays}
            />
          </div>
        </section>
      </div>

      {/* Status bar */}
      {pipelineMessage && (
        <div className="ingest-status" role="status" aria-live="polite">
          {pipelineMessage}
        </div>
      )}

      {!canRun && (
        <div id="run-disabled-reason" className="ingest-disabled-hint">
          {queue.length === 0
            ? t('run.disabledNoFile')
            : t('run.disabledNoMapping')}
        </div>
      )}

      {/* Collision warning panel — overlay when collisions present */}
      {collisions && collisions.length > 0 && (
        <CollisionWarningPanel
          collisions={collisions}
          onCancel={() => {
            setCollisions(null)
            setPipelineMessage(null)
          }}
          onContinue={() => {
            // For W3, "Continue" just dismisses. W4 wires it to medical:redact.
            setCollisions(null)
            setPipelineMessage(t('pipeline.todoW4'))
          }}
        />
      )}
    </div>
  )
}
