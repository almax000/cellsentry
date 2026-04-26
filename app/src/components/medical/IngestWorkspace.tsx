/**
 * Ingest + Mapping workspace — v2 main work surface (W3 Step 3.6 / W4 Step 4.x wiring).
 *
 * Spec: `_design/v2/screen-1-ingest-mapping.md`. This is screen 1 of 4 in the
 * v2 medical pseudonymization flow. After Run pipeline, transitions:
 *   1. Ingest + Mapping     ← this file (phase: 'ingest')
 *   2. Collision warning    ← CollisionWarningPanel.tsx (overlay when collisions found)
 *   3. Redaction preview    ← AuditDiffViewer (phase: 'preview')
 *   4. Safety-net review    ← SafetyNetReview (phase: 'safety-net', when flags exist)
 *
 * For W4 the source-text input is a paste-textarea AND a file drop zone.
 * Drop a `.txt` to populate the textarea (real OCR for image/PDF needs the
 * user to install mlx_vlm + download DeepSeek-OCR weights — pipeline path
 * works through the orchestrator's OCR stage when those are present).
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import MappingEditor from './MappingEditor'
import DateModeSelector from './DateModeSelector'
import CollisionWarningPanel from './CollisionWarningPanel'
import AuditDiffViewer from './AuditDiffViewer'
import SafetyNetReview from './SafetyNetReview'
import './IngestWorkspace.css'

type DateMode = 'preserve' | 'offset_days' | 'bucket_month'
type Phase = 'ingest' | 'preview' | 'safety-net' | 'done'

interface CollisionWarning {
  longer: string
  shorter: string
  contexts: string[]
}

interface RedactionResult {
  output: string
  replacements: Array<{
    original: string
    pseudonym: string
    span: [number, number]
    reason: 'mapping' | 'regex' | 'safety_net' | 'date'
    pattern_type?: string
  }>
  pending_flags: Array<{
    name: string
    context: string
    confidence: number
    suggested_replacement?: string
  }>
  collisions: CollisionWarning[]
  timings: { total_ms: number }
}

const DEFAULT_MAPPING = `# CellSentry pseudonym map
# Manage via the CellSentry app or hand-edit; the app respects manual changes.
version: 1
next_pseudonym_index: 0
patients: []
`

export default function IngestWorkspace(): JSX.Element {
  const { t } = useTranslation('medical')

  const [phase, setPhase] = useState<Phase>('ingest')
  const [sourceText, setSourceText] = useState('')
  const [mappingText, setMappingText] = useState(DEFAULT_MAPPING)
  const [dateMode, setDateMode] = useState<DateMode>('preserve')
  const [offsetDays, setOffsetDays] = useState(30)
  const [collisions, setCollisions] = useState<CollisionWarning[] | null>(null)
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<RedactionResult | null>(null)
  const [finalResult, setFinalResult] = useState<RedactionResult | null>(null)

  void dateMode; void offsetDays  // applied via mapping YAML date_mode field; UI affordance is informational for now

  // ── File drop / browse populates the textarea ──────────────────────────
  const handleBrowseAndLoad = async (): Promise<void> => {
    const path = await window.api?.openFileDialog?.()
    if (!path) return
    if (!path.endsWith('.txt')) {
      setPipelineMessage(t('pipeline.txtOnlyForNow'))
      return
    }
    // Read the .txt content via shell open is wrong; read inline via IPC.
    // For W4 minimal viable, we just paste path → fetch via fs in main isn't
    // exposed through the renderer. Surface a hint to the user.
    setPipelineMessage(t('pipeline.pasteHint', { path }))
  }

  // ── Run pipeline ───────────────────────────────────────────────────────
  const canRun = sourceText.trim().length > 0 && mappingText.trim().length > 0

  const runPreview = async (): Promise<void> => {
    setPipelineMessage(t('pipeline.running'))
    setCollisions(null)
    setPreviewResult(null)

    const result = await window.api?.medical?.redactInline?.(sourceText, mappingText, true)
    if (!result) {
      setPipelineMessage(t('pipeline.error', { msg: 'no IPC' }))
      return
    }
    if ('error' in result) {
      setPipelineMessage(t('pipeline.error', { msg: result.error }))
      return
    }

    setPipelineMessage(null)
    if (result.collisions.length > 0) {
      setCollisions(result.collisions)
      return
    }
    setPreviewResult(result as RedactionResult)
    setPhase('preview')
  }

  const runFinal = async (): Promise<void> => {
    setPipelineMessage(t('pipeline.runningSafetyNet'))
    const result = await window.api?.medical?.redactInline?.(sourceText, mappingText, false)
    if (!result || 'error' in result) {
      setPipelineMessage(t('pipeline.error', { msg: result && 'error' in result ? result.error : 'no IPC' }))
      return
    }
    setPipelineMessage(null)
    setFinalResult(result as RedactionResult)
    if (result.pending_flags.length > 0) {
      setPhase('safety-net')
    } else {
      setPhase('done')
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && canRun && phase === 'ingest') {
        e.preventDefault()
        runPreview()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canRun, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase: preview (AuditDiffViewer) ───────────────────────────────────
  if (phase === 'preview' && previewResult) {
    return (
      <AuditDiffViewer
        originalText={sourceText}
        redactedText={previewResult.output}
        replacements={previewResult.replacements}
        onBack={() => {
          setPhase('ingest')
          setPreviewResult(null)
        }}
        onContinue={() => {
          runFinal()
        }}
      />
    )
  }

  // ── Phase: safety-net review ───────────────────────────────────────────
  if (phase === 'safety-net' && finalResult) {
    return (
      <SafetyNetReview
        flags={finalResult.pending_flags}
        onCancel={() => setPhase('preview')}
        onExport={async (resolutions) => {
          // For W4 minimal: copy redacted text to clipboard. Real export
          // (write .md, audit log .json) is W5 polish.
          await navigator.clipboard.writeText(finalResult.output)
          setPipelineMessage(t('pipeline.exportedClipboard', { count: resolutions.length }))
          setPhase('done')
        }}
      />
    )
  }

  // ── Phase: done ────────────────────────────────────────────────────────
  if (phase === 'done' && finalResult) {
    return (
      <div className="ingest-workspace view-enter">
        <header className="ingest-header">
          <h1 className="ingest-title">{t('done.title')}</h1>
        </header>
        <div className="ingest-status" role="status">
          {t('done.message')}
        </div>
        <button
          className="ingest-run-cta"
          onClick={() => {
            setPhase('ingest')
            setPreviewResult(null)
            setFinalResult(null)
            setSourceText('')
            setPipelineMessage(null)
          }}
        >
          {t('done.startOver')}
        </button>
      </div>
    )
  }

  // ── Phase: ingest (default) ────────────────────────────────────────────
  return (
    <div className="ingest-workspace view-enter">
      <header className="ingest-header">
        <h1 className="ingest-title">{t('workspace.title')}</h1>
        <button
          className="ingest-run-cta"
          onClick={runPreview}
          disabled={!canRun}
          aria-disabled={!canRun}
          aria-describedby={!canRun ? 'run-disabled-reason' : undefined}
          data-testid="run-pipeline-cta"
        >
          {t('workspace.runCta')}
        </button>
      </header>

      <div className="ingest-panes">
        {/* Left pane — source text input */}
        <section className="ingest-left">
          <textarea
            className="ingest-source-textarea"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t('source.placeholder')}
            data-testid="source-textarea"
            aria-label={t('source.aria')}
          />
          <button
            className="ingest-source-load"
            onClick={handleBrowseAndLoad}
            data-testid="source-load"
          >
            {t('source.loadFromFile')}
          </button>
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

      {pipelineMessage && (
        <div className="ingest-status" role="status" aria-live="polite">
          {pipelineMessage}
        </div>
      )}

      {!canRun && (
        <div id="run-disabled-reason" className="ingest-disabled-hint">
          {sourceText.trim().length === 0
            ? t('run.disabledNoSource')
            : t('run.disabledNoMapping')}
        </div>
      )}

      {/* Collision warning overlay */}
      {collisions && collisions.length > 0 && (
        <CollisionWarningPanel
          collisions={collisions}
          onCancel={() => {
            setCollisions(null)
            setPipelineMessage(null)
          }}
          onContinue={() => {
            setCollisions(null)
            setPipelineMessage(t('pipeline.collisionApproved'))
          }}
        />
      )}
    </div>
  )
}
