/**
 * Ingest + Mapping workspace — v2 lean rebuild (D31-D35).
 *
 * Phases reduced from 4 to 3:
 *   1. Ingest          ← this file (phase: 'ingest') — textarea + MappingEditor
 *   2. Redaction preview ← AuditDiffViewer (phase: 'preview')
 *   3. Done            ← post-export confirmation (phase: 'done')
 *
 * REVOKED in lean rebuild (do not re-add without ADR amendment):
 *   - Collision warning overlay (AD3)
 *   - Date-mode selector (AD4)
 *   - Safety-net review (D21 / AD2)
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import MappingEditor from './MappingEditor'
import AuditDiffViewer from './AuditDiffViewer'
import './IngestWorkspace.css'

type Phase = 'ingest' | 'preview' | 'done'

interface RedactionResult {
  output: string
  replacements: Array<{
    original: string
    pseudonym: string
    span: [number, number]
    reason: 'mapping' | 'regex'
    pattern_type?: string
  }>
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
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null)
  const [result, setResult] = useState<RedactionResult | null>(null)

  const handleBrowseAndLoad = async (): Promise<void> => {
    const path = await window.api?.openFileDialog?.()
    if (!path) return
    if (!path.endsWith('.txt')) {
      setPipelineMessage(t('pipeline.txtOnlyForNow'))
      return
    }
    setPipelineMessage(t('pipeline.pasteHint', { path }))
  }

  const canRun = sourceText.trim().length > 0 && mappingText.trim().length > 0

  const runRedact = async (): Promise<void> => {
    setPipelineMessage(t('pipeline.running'))
    setResult(null)

    const response = await window.api?.medical?.redactInline?.(sourceText, mappingText)
    if (!response) {
      setPipelineMessage(t('pipeline.error', { msg: 'no IPC' }))
      return
    }
    if ('error' in response) {
      setPipelineMessage(t('pipeline.error', { msg: response.error }))
      return
    }

    setPipelineMessage(null)
    setResult(response as RedactionResult)
    setPhase('preview')
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && canRun && phase === 'ingest') {
        e.preventDefault()
        runRedact()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canRun, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'preview' && result) {
    return (
      <AuditDiffViewer
        originalText={sourceText}
        redactedText={result.output}
        replacements={result.replacements}
        onBack={() => {
          setPhase('ingest')
          setResult(null)
        }}
        onContinue={async () => {
          await navigator.clipboard.writeText(result.output)
          setPipelineMessage(t('pipeline.exportedClipboard'))
          setPhase('done')
        }}
      />
    )
  }

  if (phase === 'done' && result) {
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
            setResult(null)
            setSourceText('')
            setPipelineMessage(null)
          }}
        >
          {t('done.startOver')}
        </button>
      </div>
    )
  }

  return (
    <div className="ingest-workspace view-enter">
      <header className="ingest-header">
        <h1 className="ingest-title">{t('workspace.title')}</h1>
        <button
          className="ingest-run-cta"
          onClick={runRedact}
          disabled={!canRun}
          aria-disabled={!canRun}
          aria-describedby={!canRun ? 'run-disabled-reason' : undefined}
          data-testid="run-pipeline-cta"
        >
          {t('workspace.runCta')}
        </button>
      </header>

      <div className="ingest-panes">
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

        <section className="ingest-right">
          <div className="mapping-editor-wrap">
            <MappingEditor value={mappingText} onChange={setMappingText} />
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
    </div>
  )
}
