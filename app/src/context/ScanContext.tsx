import { createContext, useContext, useReducer, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type {
  ScanState,
  ScanProgress,
  AnalysisResult,
  AnalysisSummary,
  ActiveView,
  FileInfo,
  Issue,
  ScanPhase,
  QueuedFile,
  BatchResult,
  BatchState,
} from '../types'
import { mapSeverity } from '../utils/format'
import i18n from '../i18n'
import { toEngineLocale } from '../../shared/locale'
import { readAuditReviewProgress, readAuditReviewSummary } from '../../shared/auditReviewValidation'

// ── State ──

interface ScanContextState {
  scanState: ScanState
  scanMode: 'audit'
  activeView: ActiveView
  filePath: string
  fileInfo: FileInfo | null
  progress: ScanProgress
  // Audit results arrive once after rules and again when optional AI review ends.
  results: AnalysisResult | null
  auditError: string | null
  error: string
  stopRetryRequired: boolean
  enginesComplete: number
  activeScanId: string | null
  completedEngines: Partial<Record<'audit', true>>
  // Batch scan state
  batchState: BatchState
  batchFiles: QueuedFile[]
  batchIndex: number
  batchResults: BatchResult | null
  isBatch: boolean
  // Monotonic counters: navigation reacts to "a scan started" or "a scan failed",
  // even when React batches the start and the finish into one render.
  runSeq: number
  errorSeq: number
}

const initialState: ScanContextState = {
  scanState: 'idle',
  scanMode: 'audit',
  activeView: 'audit',
  filePath: '',
  fileInfo: null,
  progress: { phase: 'rules', percent: 0, message: '' },
  results: null,
  auditError: null,
  error: '',
  stopRetryRequired: false,
  enginesComplete: 0,
  activeScanId: null,
  completedEngines: {},
  batchState: 'idle',
  batchFiles: [],
  batchIndex: -1,
  batchResults: null,
  isBatch: false,
  runSeq: 0,
  errorSeq: 0,
}

// ── Actions ──

type ScanAction =
  | { type: 'START_SCAN'; filePath: string; fileInfo: FileInfo; scanId: string }
  | { type: 'UPDATE_PROGRESS'; progress: ScanProgress; scanId?: string }
  | { type: 'ENGINE_DONE'; scanId: string; engine: 'audit'; result?: unknown; error?: string; stage?: 'rules' | 'complete'; invalidate?: boolean }
  | { type: 'SCAN_COMPLETE'; results: AnalysisResult }
  | { type: 'SCAN_ERROR'; error: string; stopRetryRequired?: boolean }
  | { type: 'CANCEL_SCAN' }
  | { type: 'CANCEL_REQUEST' }
  | { type: 'SET_VIEW'; view: ActiveView }
  | { type: 'RESET' }
  | { type: 'START_BATCH'; files: QueuedFile[] }
  | { type: 'BATCH_FILE_START'; index: number; scanId?: string }
  | { type: 'BATCH_FILE_COMPLETE'; index: number; result: AnalysisResult }
  | { type: 'BATCH_FILE_ERROR'; index: number; error: string }
  | { type: 'SELECT_BATCH_FILE'; index: number }
  | { type: 'BATCH_COMPLETE' }

function aggregateSummary(files: QueuedFile[]): AnalysisSummary {
  let errors = 0, warnings = 0, info = 0, total = 0
  for (const f of files) {
    if (f.result?.summary) {
      errors += f.result.summary.errors
      warnings += f.result.summary.warnings
      info += f.result.summary.info
      total += f.result.summary.total
    }
  }
  return { errors, warnings, info, total }
}

// ── Map raw sidecar issues ──

function mapRawResult(filePath: string, fileName: string, rawResult: Record<string, unknown>): AnalysisResult {
  const issues: Issue[] = ((rawResult.issues as Record<string, unknown>[]) || []).map(
    (ri, idx) => ({
      id: `issue-${idx}`,
      sheetName: (ri.sheet_name as string) || (ri.sheet as string) || 'Sheet1',
      cell: (ri.cell_address as string) || (ri.cell as string) || 'A1',
      formula: (ri.formula as string) || '',
      ruleId: (ri.rule_id as string) || (ri.ruleId as string) || '',
      severity: mapSeverity((ri.severity as string) || 'medium'),
      confidence: typeof ri.confidence === 'number' ? ri.confidence : Number(ri.confidence) || 0.8,
      message: (ri.message as string) || '',
      suggestion: (ri.suggestion as string) || '',
      category: (ri.category as string) || '',
      layer: (ri.layer as 'rule' | 'ai') || 'rule',
      ...(Object.prototype.hasOwnProperty.call(ri, 'currentValue') && { currentValue: ri.currentValue }),
      ...(Object.prototype.hasOwnProperty.call(ri, 'expectedValue') && { expectedValue: ri.expectedValue }),
      ...(Object.prototype.hasOwnProperty.call(ri, 'correctFormula') && { correctFormula: ri.correctFormula as string | null }),
      ...(ri.llmVerified !== undefined && { llmVerified: ri.llmVerified as boolean }),
      ...(ri.llmDisputed !== undefined && { llmDisputed: ri.llmDisputed as boolean }),
      ...(ri.llmReviewRequired === true && { llmReviewRequired: true }),
      ...(ri.llmConfidence !== undefined && { llmConfidence: ri.llmConfidence as number }),
      ...(ri.llmReasoning !== undefined && { llmReasoning: ri.llmReasoning as string }),
    })
  )

  const summary: AnalysisSummary = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
    total: issues.length,
  }

  return {
    success: true,
    filePath,
    fileName,
    issues,
    summary,
    scannedAt: (rawResult.scannedAt as string) || new Date().toISOString(),
    duration: (rawResult.duration as number) || 0,
    aiWarning: typeof rawResult.aiWarning === 'string' ? rawResult.aiWarning : undefined,
    sourceFingerprint: typeof rawResult.sourceFingerprint === 'string' ? rawResult.sourceFingerprint : undefined,
    auditReview: (() => {
      const review = readAuditReviewSummary(rawResult.auditReview)
      return review?.total === issues.length ? review : undefined
    })(),
  }
}

// ── Reducer ──

/** Counters survive every reset; only START_* and SCAN_ERROR advance them. */
function counters(state: ScanContextState | undefined): Pick<ScanContextState, 'runSeq' | 'errorSeq'> {
  return { runSeq: state?.runSeq ?? 0, errorSeq: state?.errorSeq ?? 0 }
}

export function scanReducer(state: ScanContextState, action: ScanAction): ScanContextState {
  switch (action.type) {
    case 'START_SCAN':
      return {
        ...initialState,
        ...counters(state),
        runSeq: counters(state).runSeq + 1,
        scanState: 'scanning',
        scanMode: 'audit',
        activeView: 'audit',
        filePath: action.filePath,
        fileInfo: action.fileInfo,
        activeScanId: action.scanId,
        isBatch: false,
      }
    case 'UPDATE_PROGRESS':
      if (state.scanState !== 'scanning' || action.scanId !== state.activeScanId) return state
      if (action.progress.auditReview && state.completedEngines.audit) return state
      return { ...state, progress: action.progress }

    case 'ENGINE_DONE': {
      if ((state.scanState !== 'scanning' && state.scanState !== 'complete') || action.scanId !== state.activeScanId) return state
      if (state.completedEngines.audit && action.stage !== 'rules') return state
      if (action.stage === 'rules' && state.results) return state
      if (action.invalidate) {
        return { ...state, results: null, auditError: action.error || 'Workbook changed during analysis', scanState: 'error', error: action.error || 'Workbook changed during analysis', activeScanId: null, completedEngines: {}, enginesComplete: 0 }
      }
      if (action.error) {
        return { ...state, auditError: action.error, scanState: state.results ? 'complete' : 'error', error: state.results ? state.error : action.error }
      }
      if (!action.result) return state
      const newResults = mapRawResult(state.filePath, state.fileInfo?.fileName || '', action.result as Record<string, unknown>)
      const complete = action.stage !== 'rules'
      return {
        ...state,
        results: newResults,
        auditError: null,
        scanState: complete ? 'complete' : 'scanning',
        enginesComplete: complete ? 1 : 0,
        completedEngines: complete ? { audit: true } : {},
      }
    }

    // Legacy single-engine completions (used by batch mode + test triggers)
    case 'SCAN_COMPLETE':
      return { ...state, scanState: 'complete', results: action.results }

    case 'SCAN_ERROR':
      return { ...state, scanState: 'error', error: action.error, stopRetryRequired: action.stopRetryRequired ?? false, errorSeq: state.errorSeq + 1 }
    case 'CANCEL_SCAN':
      // A cancellation during optional AI review retains the independently
      // completed rule evidence; it never turns the workbook into “all clear”.
      return state.results
        ? { ...state, scanState: 'complete', activeScanId: null, completedEngines: { audit: true }, enginesComplete: 1, error: '' }
        : { ...initialState, ...counters(state), error: 'Analysis cancelled' }
    case 'CANCEL_REQUEST':
      return state.scanState === 'scanning' || state.stopRetryRequired ? { ...state, scanState: 'cancelling' } : state
    case 'SET_VIEW':
      return { ...state, activeView: action.view }
    case 'RESET':
      return { ...initialState, ...counters(state) }

    // Batch actions (unchanged)
    case 'START_BATCH':
      return {
        ...initialState,
        ...counters(state),
        runSeq: counters(state).runSeq + 1,
        isBatch: true,
        batchState: 'scanning',
        scanState: 'scanning',
        batchFiles: action.files,
        batchIndex: 0,
        batchResults: {
          files: action.files,
          totalFiles: action.files.length,
          completedFiles: 0,
          aggregateSummary: { errors: 0, warnings: 0, info: 0, total: 0 },
          startedAt: new Date().toISOString(),
        },
      }
    case 'BATCH_FILE_START': {
      const files = [...state.batchFiles]
      files[action.index] = { ...files[action.index], status: 'scanning' }
      return {
        ...state,
        batchFiles: files,
        batchIndex: action.index,
        activeScanId: action.scanId ?? null,
        filePath: files[action.index].path,
        progress: { phase: 'rules', percent: 0, message: `Scanning ${files[action.index].name}...` },
      }
    }
    case 'BATCH_FILE_COMPLETE': {
      const files = [...state.batchFiles]
      files[action.index] = { ...files[action.index], status: 'complete', result: action.result }
      const completed = files.filter((f) => f.status === 'complete' || f.status === 'error').length
      return {
        ...state,
        batchFiles: files,
        batchResults: state.batchResults
          ? {
              ...state.batchResults,
              files,
              completedFiles: completed,
              aggregateSummary: aggregateSummary(files),
            }
          : null,
      }
    }
    case 'BATCH_FILE_ERROR': {
      const files = [...state.batchFiles]
      files[action.index] = { ...files[action.index], status: 'error', error: action.error }
      const completed = files.filter((f) => f.status === 'complete' || f.status === 'error').length
      return {
        ...state,
        batchFiles: files,
        batchResults: state.batchResults
          ? { ...state.batchResults, files, completedFiles: completed }
          : null,
      }
    }
    case 'SELECT_BATCH_FILE': {
      const file = state.batchFiles[action.index]
      if (!file) return state
      if (file.result) {
        return {
          ...state,
          batchIndex: action.index,
          filePath: file.path,
          scanState: 'complete',
          error: '',
          results: file.result,
        }
      }
      return {
        ...state,
        batchIndex: action.index,
        filePath: file.path,
        scanState: 'error',
        results: null,
        error: file.error || 'Analysis failed',
      }
    }
    case 'BATCH_COMPLETE': {
      const selectedIndex = state.batchFiles.findIndex(f => f.result && f.result.issues.length > 0)
      const index = selectedIndex >= 0 ? selectedIndex : state.batchFiles.findIndex(f => f.result)
      const selected = state.batchFiles[index >= 0 ? index : 0]
      return {
        ...state,
        batchState: 'complete',
        scanState: selected?.result ? 'complete' : 'error',
        batchIndex: Math.max(0, index),
        filePath: selected?.path || '',
        error: selected?.result ? '' : selected?.error || 'Analysis failed',
        batchResults: state.batchResults
          ? {
              ...state.batchResults,
              completedAt: new Date().toISOString(),
              aggregateSummary: aggregateSummary(state.batchFiles),
            }
          : null,
        results: selected?.result || null,
      }
    }
    default:
      return state
  }
}

// ── Context ──

interface ScanContextValue extends ScanContextState {
  startScan: (filePath: string) => Promise<void>
  startBatchScan: (filePaths: Array<{ path: string; name: string; size: number }>) => Promise<void>
  cancelScan: () => Promise<boolean>
  selectBatchFile: (index: number) => void
  setActiveView: (view: ActiveView) => void
  reset: () => Promise<void>
}

const ScanContext = createContext<ScanContextValue>({
  ...initialState,
  startScan: async () => {},
  startBatchScan: async () => {},
  cancelScan: async () => true,
  selectBatchFile: () => {},
  setActiveView: () => {},
  reset: async () => {},
})

// ── Provider ──

export function ScanProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(scanReducer, initialState)
  const activeScanIdRef = useRef<string | null>(null)
  const retainedStopScanIdRef = useRef<string | null>(null)
  const activeBatchRunRef = useRef<string | null>(null)
  const scanSequenceRef = useRef(0)
  const cancelInFlightRef = useRef<Promise<boolean> | null>(null)

  const stopForTransition = async (scanId: string): Promise<boolean> => {
    // Invalidate the loop before awaiting IPC: a late file response must not
    // start the next batch file while cancellation is still being confirmed.
    activeBatchRunRef.current = null
    if (cancelInFlightRef.current) return cancelInFlightRef.current
    if (activeScanIdRef.current !== scanId) return false
    // Detach before IPC so the old scan's response/finally cannot consume the
    // identity needed for a failed-stop retry. Transitions share the same stop
    // promise as Cancel, so a new scan cannot start before this stop settles.
    activeScanIdRef.current = null
    const pending: Promise<boolean> = Promise.resolve().then(async () => {
      try {
        const stopped = await window.api?.cancelAnalysis(scanId)
        if (!stopped?.success) throw new Error('Stop not confirmed')
        if (retainedStopScanIdRef.current === scanId) retainedStopScanIdRef.current = null
        return true
      } catch {
        if (activeScanIdRef.current === null) {
          activeScanIdRef.current = scanId
          retainedStopScanIdRef.current = scanId
          dispatch({ type: 'SCAN_ERROR', error: i18n.t('scanning:aiReviewStopFailed'), stopRetryRequired: true })
        }
        return false
      } finally { cancelInFlightRef.current = null }
    })
    cancelInFlightRef.current = pending
    return pending
  }

  const createScanId = (): string => {
    scanSequenceRef.current += 1
    return `scan-${Date.now()}-${scanSequenceRef.current}`
  }

  const syncEngineLocale = async (): Promise<void> => {
    const result = await window.api.setEngineLocale(toEngineLocale(i18n.resolvedLanguage || i18n.language))
    if (!result.success) throw new Error(result.error || 'Unable to synchronize engine language')
  }

  // Subscribe to progress updates
  useEffect(() => {
    if (!window.api?.onScanProgress) return

    const unsubscribe = window.api.onScanProgress((rawProgress) => {
      const progress: ScanProgress = {
        phase: (rawProgress.phase || rawProgress.stage || 'rules') as ScanPhase,
        percent: rawProgress.percent ?? rawProgress.progress ?? 0,
        message: rawProgress.message || '',
        auditReview: readAuditReviewProgress(rawProgress.auditReview),
      }
      dispatch({
        type: 'UPDATE_PROGRESS',
        progress,
        scanId: (rawProgress as ScanProgress & { scanId?: string }).scanId,
      })
    })

    return unsubscribe
  }, [])

  // Subscribe to per-engine progressive results
  useEffect(() => {
    if (!window.api?.onEngineDone) return

    const unsubscribe = window.api.onEngineDone((data) => {
      if (data.engine !== 'audit') return
      dispatch({
        type: 'ENGINE_DONE',
        scanId: (data as unknown as { scanId: string }).scanId,
        engine: 'audit',
        result: data.result,
        error: data.error,
        stage: (data as unknown as { stage?: 'rules' | 'complete' }).stage,
        invalidate: (data as unknown as { invalidate?: boolean }).invalidate,
      })
    })

    return unsubscribe
  }, [])

  // A workbook scan runs the formula audit; optional local AI only enriches
  // those same rule findings.
  const startScan = useCallback(async (filePath: string) => {
    if (!window.api) {
      dispatch({ type: 'SCAN_ERROR', error: 'Sidecar not available' })
      return
    }

    try {
      await syncEngineLocale()
    } catch (error) {
      dispatch({ type: 'SCAN_ERROR', error: error instanceof Error ? error.message : 'Unable to synchronize engine language' })
      return
    }

    if (cancelInFlightRef.current && !await cancelInFlightRef.current) return
    const previousScanId = activeScanIdRef.current
    if (previousScanId) {
      if (!await stopForTransition(previousScanId)) return
    }
    const scanId = createScanId()
    activeBatchRunRef.current = null
    retainedStopScanIdRef.current = null
    activeScanIdRef.current = scanId
    let retainForStopRetry = false
    try {
      const rawInfo = await window.api.getFileInfo(filePath)
      if (activeScanIdRef.current !== scanId || retainedStopScanIdRef.current === scanId) return
      if (rawInfo.success === false) throw new Error(rawInfo.error || 'Unable to read spreadsheet')
      const fileInfo: FileInfo = {
        success: rawInfo.success ?? true,
        fileName: rawInfo.fileName ?? rawInfo.name ?? '',
        fileSize: rawInfo.fileSize ?? 0,
        sheets: (rawInfo.sheets ?? []).map(sheet => ({ ...sheet, columns: sheet.cols, cells: sheet.cells ?? 0 })),
        totalCells: rawInfo.totalCells ?? rawInfo.cellCount ?? 0,
      }

      dispatch({ type: 'START_SCAN', filePath, fileInfo, scanId })
      const response = await window.api.analyzeAll(filePath, scanId)
      if (activeScanIdRef.current !== scanId || retainedStopScanIdRef.current === scanId) return
      if (!response.success) {
        retainForStopRetry = response.errorCode === 'model-stop-failed'
        dispatch({ type: 'SCAN_ERROR', error: retainForStopRetry ? i18n.t('scanning:aiReviewStopFailed') : response.error || 'Analysis failed', stopRetryRequired: retainForStopRetry })
      }
      // Rule results and any later AI enrichment arrive through onEngineDone.
    } catch (err) {
      if (activeScanIdRef.current !== scanId || retainedStopScanIdRef.current === scanId) return
      dispatch({
        type: 'SCAN_ERROR',
        error: err instanceof Error ? err.message : 'Analysis failed',
      })
    } finally {
      if (!retainForStopRetry && retainedStopScanIdRef.current !== scanId && activeScanIdRef.current === scanId) activeScanIdRef.current = null
    }
  }, [])

  // Test-mode entry mirrors the sole production workbook flow.
  useEffect(() => {
    if (!window.api?.onTestTriggerAnalysis) return
    const unsubscribe = window.api.onTestTriggerAnalysis((filePath) => {
      startScan(filePath)
    })
    return unsubscribe
  }, [startScan])

  // Batch scan — processes files sequentially (audit only)
  const startBatchScan = useCallback(
    async (filePaths: Array<{ path: string; name: string; size: number }>) => {
      if (!window.api) {
        dispatch({ type: 'SCAN_ERROR', error: 'Sidecar not available' })
        return
      }

      try {
        await syncEngineLocale()
      } catch (error) {
        dispatch({ type: 'SCAN_ERROR', error: error instanceof Error ? error.message : 'Unable to synchronize engine language' })
        return
      }

      const queuedFiles: QueuedFile[] = filePaths.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        status: 'pending' as const,
      }))

      if (cancelInFlightRef.current && !await cancelInFlightRef.current) return
      const batchId = createScanId()
      if (activeScanIdRef.current) {
        if (!await stopForTransition(activeScanIdRef.current)) return
      }
      activeBatchRunRef.current = batchId
      retainedStopScanIdRef.current = null
      dispatch({ type: 'START_BATCH', files: queuedFiles })

      for (let i = 0; i < queuedFiles.length; i++) {
        if (activeBatchRunRef.current !== batchId) return
        const file = queuedFiles[i]
        const fileScanId = `${batchId}-file-${i}`
        activeScanIdRef.current = fileScanId
        dispatch({ type: 'BATCH_FILE_START', index: i, scanId: fileScanId })

        try {
          const rawResult = await window.api.analyzeFile(file.path, fileScanId)
          if (activeBatchRunRef.current !== batchId || activeScanIdRef.current !== fileScanId) return

          if (!rawResult.success) {
            if (rawResult.errorCode === 'model-stop-failed') {
              activeBatchRunRef.current = null
              dispatch({ type: 'SCAN_ERROR', error: i18n.t('scanning:aiReviewStopFailed'), stopRetryRequired: true })
              return
            }
            dispatch({
              type: 'BATCH_FILE_ERROR',
              index: i,
              error: rawResult.error || 'Analysis failed',
            })
            continue
          }

          const result = mapRawResult(file.path, file.name, rawResult as unknown as Record<string, unknown>)
          dispatch({ type: 'BATCH_FILE_COMPLETE', index: i, result })
        } catch (err) {
          if (activeBatchRunRef.current !== batchId || activeScanIdRef.current !== fileScanId) return
          dispatch({
            type: 'BATCH_FILE_ERROR',
            index: i,
            error: err instanceof Error ? err.message : 'Analysis failed',
          })
        }
      }

      if (activeBatchRunRef.current !== batchId) return
      activeBatchRunRef.current = null
      activeScanIdRef.current = null
      dispatch({ type: 'BATCH_COMPLETE' })
    },
    []
  )

  const selectBatchFile = useCallback(
    (index: number) => {
      dispatch({ type: 'SELECT_BATCH_FILE', index })
    },
    [state.batchFiles]
  )

  const cancelScan = useCallback((): Promise<boolean> => {
    if (cancelInFlightRef.current) return cancelInFlightRef.current
    const scanId = activeScanIdRef.current
    if (!scanId) return Promise.resolve(true)
    activeBatchRunRef.current = null
    dispatch({ type: 'CANCEL_REQUEST' })
    activeScanIdRef.current = null
    const pending = (async () => {
      try {
        const result = await window.api?.cancelAnalysis(scanId)
        if (!result?.success) throw new Error(result?.error || 'Unable to cancel analysis')
        if (retainedStopScanIdRef.current === scanId) retainedStopScanIdRef.current = null
        dispatch({ type: 'CANCEL_SCAN' })
        return true
      } catch (error) {
        activeScanIdRef.current = scanId
        retainedStopScanIdRef.current = scanId
        dispatch({ type: 'SCAN_ERROR', error: i18n.t('scanning:aiReviewStopFailed'), stopRetryRequired: true })
        return false
      } finally { cancelInFlightRef.current = null }
    })()
    cancelInFlightRef.current = pending
    return pending
  }, [])

  const setActiveView = useCallback((view: ActiveView) => {
    dispatch({ type: 'SET_VIEW', view })
  }, [])

  const reset = useCallback(async () => {
    if (cancelInFlightRef.current && !await cancelInFlightRef.current) return
    const scanId = activeScanIdRef.current
    if (scanId) {
      if (!await stopForTransition(scanId)) return
    }
    activeScanIdRef.current = null
    retainedStopScanIdRef.current = null
    activeBatchRunRef.current = null
    dispatch({ type: 'RESET' })
  }, [])

  return (
    <ScanContext.Provider
      value={{ ...state, startScan, startBatchScan, cancelScan, selectBatchFile, setActiveView, reset }}
    >
      {children}
    </ScanContext.Provider>
  )
}

export function useScan(): ScanContextValue {
  return useContext(ScanContext)
}
