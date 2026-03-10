import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react'
import type {
  ScanState,
  ScanMode,
  ScanProgress,
  AnalysisResult,
  AnalysisSummary,
  PiiResult,
  PiiFinding,
  PiiSummary,
  PiiType,
  ExtractionResult,
  ExtractionField,
  ExtractedTable,
  DocumentType,
  FileInfo,
  Issue,
  ScanPhase,
  QueuedFile,
  BatchResult,
  BatchState,
} from '../types'
import { mapSeverity } from '../utils/format'

// ── State ──

interface ScanContextState {
  // Single-file scan state (preserved for backward compat)
  scanState: ScanState
  scanMode: ScanMode
  filePath: string
  fileInfo: FileInfo | null
  progress: ScanProgress
  results: AnalysisResult | null
  piiResults: PiiResult | null
  extractionResults: ExtractionResult | null
  error: string
  // Batch scan state
  batchState: BatchState
  batchFiles: QueuedFile[]
  batchIndex: number
  batchResults: BatchResult | null
  // Mode flag
  isBatch: boolean
}

const initialState: ScanContextState = {
  scanState: 'idle',
  scanMode: 'audit',
  filePath: '',
  fileInfo: null,
  progress: { phase: 'rules', percent: 0, message: '' },
  results: null,
  piiResults: null,
  extractionResults: null,
  error: '',
  batchState: 'idle',
  batchFiles: [],
  batchIndex: -1,
  batchResults: null,
  isBatch: false,
}

// ── Actions ──

type ScanAction =
  | { type: 'START_SCAN'; filePath: string; fileInfo: FileInfo; mode?: ScanMode }
  | { type: 'UPDATE_PROGRESS'; progress: ScanProgress }
  | { type: 'SCAN_COMPLETE'; results: AnalysisResult }
  | { type: 'PII_COMPLETE'; results: PiiResult }
  | { type: 'EXTRACTION_COMPLETE'; results: ExtractionResult }
  | { type: 'SCAN_ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'START_BATCH'; files: QueuedFile[] }
  | { type: 'BATCH_FILE_START'; index: number }
  | { type: 'BATCH_FILE_COMPLETE'; index: number; result: AnalysisResult }
  | { type: 'BATCH_FILE_ERROR'; index: number; error: string }
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

function scanReducer(state: ScanContextState, action: ScanAction): ScanContextState {
  switch (action.type) {
    case 'START_SCAN':
      return {
        ...initialState,
        scanState: 'scanning',
        scanMode: action.mode || 'audit',
        filePath: action.filePath,
        fileInfo: action.fileInfo,
        isBatch: false,
      }
    case 'UPDATE_PROGRESS':
      return { ...state, progress: action.progress }
    case 'SCAN_COMPLETE':
      return { ...state, scanState: 'complete', results: action.results }
    case 'PII_COMPLETE':
      return { ...state, scanState: 'complete', piiResults: action.results }
    case 'EXTRACTION_COMPLETE':
      return { ...state, scanState: 'complete', extractionResults: action.results }
    case 'SCAN_ERROR':
      return { ...state, scanState: 'error', error: action.error }
    case 'RESET':
      return initialState

    // Batch actions
    case 'START_BATCH':
      return {
        ...initialState,
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
        filePath: files[action.index].path,
        progress: { phase: 'rules', percent: 0, message: `Scanning ${files[action.index].name}...` },
      }
    }
    case 'BATCH_FILE_COMPLETE': {
      const files = [...state.batchFiles]
      files[action.index] = { ...files[action.index], status: 'complete', result: action.result }
      const completed = files.filter((f) => f.status === 'complete').length
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
    case 'BATCH_COMPLETE':
      return {
        ...state,
        batchState: 'complete',
        scanState: 'complete',
        batchResults: state.batchResults
          ? {
              ...state.batchResults,
              completedAt: new Date().toISOString(),
              aggregateSummary: aggregateSummary(state.batchFiles),
            }
          : null,
        // Set results to the first file with issues for ResultsPage compat
        results: state.batchFiles.find((f) => f.result && f.result.issues.length > 0)?.result
          || state.batchFiles.find((f) => f.result)?.result
          || null,
      }
    default:
      return state
  }
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
      confidence: (ri.confidence as number) || 0.8,
      message: (ri.message as string) || '',
      suggestion: (ri.suggestion as string) || '',
      category: (ri.category as string) || '',
      layer: (ri.layer as 'rule' | 'ai') || 'rule',
      ...(ri.llmVerified !== undefined && { llmVerified: ri.llmVerified as boolean }),
      ...(ri.llmConfidence !== undefined && { llmConfidence: ri.llmConfidence as number }),
      ...(ri.llmReasoning !== undefined && { llmReasoning: ri.llmReasoning as string }),
    })
  )

  const summary = (rawResult.summary as AnalysisSummary) || {
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
  }
}

// ── Map PII raw result ──

function mapPiiResult(filePath: string, fileName: string, raw: Record<string, unknown>): PiiResult {
  const findings: PiiFinding[] = ((raw.findings as Record<string, unknown>[]) || []).map(
    (rf, idx) => ({
      id: `pii-${idx}`,
      sheetName: (rf.sheet_name as string) || 'Sheet1',
      cell: (rf.cell as string) || 'A1',
      piiType: (rf.pii_type as PiiType) || 'email',
      originalValue: (rf.original_value as string) || '',
      maskedValue: (rf.masked_value as string) || '',
      confidence: (rf.confidence as number) || 0.9,
      pattern: (rf.pattern as string) || '',
    })
  )

  const byType = {} as Record<PiiType, number>
  for (const f of findings) {
    byType[f.piiType] = (byType[f.piiType] || 0) + 1
  }

  return {
    success: true,
    filePath,
    fileName,
    findings,
    summary: { total: findings.length, byType },
    scannedAt: (raw.scannedAt as string) || new Date().toISOString(),
    duration: (raw.duration as number) || 0,
  }
}

// ── Map Extraction raw result ──

function mapExtractionResult(filePath: string, fileName: string, raw: Record<string, unknown>): ExtractionResult {
  const fields: ExtractionField[] = ((raw.fields as Record<string, unknown>[]) || []).map(
    (rf) => ({
      key: (rf.key as string) || '',
      label: (rf.label as string) || '',
      value: (rf.value as string) || '',
      cell: (rf.cell as string) || '',
      sheetName: (rf.sheet_name as string) || 'Sheet1',
      confidence: (rf.confidence as number) || 0.8,
    })
  )

  const tables: ExtractedTable[] = ((raw.tables as Record<string, unknown>[]) || []).map(
    (rt) => ({
      sheetName: (rt.sheet_name as string) || 'Sheet1',
      headerRow: (rt.header_row as number) || 1,
      headers: (rt.headers as string[]) || [],
      rows: (rt.rows as string[][]) || [],
      startCell: (rt.start_cell as string) || 'A1',
      endCell: (rt.end_cell as string) || 'A1',
    })
  )

  return {
    success: true,
    filePath,
    fileName,
    documentType: (raw.document_type as DocumentType) || 'unknown',
    fields,
    tables,
    scannedAt: (raw.scannedAt as string) || new Date().toISOString(),
    duration: (raw.duration as number) || 0,
  }
}

// ── Context ──

interface ScanContextValue extends ScanContextState {
  startScan: (filePath: string, mode?: ScanMode) => Promise<void>
  startBatchScan: (filePaths: Array<{ path: string; name: string; size: number }>) => Promise<void>
  selectBatchFile: (index: number) => void
  reset: () => void
}

const ScanContext = createContext<ScanContextValue>({
  ...initialState,
  startScan: async () => {},
  startBatchScan: async () => {},
  selectBatchFile: () => {},
  reset: () => {},
})

// ── Provider ──

export function ScanProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(scanReducer, initialState)

  // Subscribe to progress updates from sidecar WebSocket
  useEffect(() => {
    if (!window.api?.onScanProgress) return

    const unsubscribe = window.api.onScanProgress((rawProgress) => {
      const progress: ScanProgress = {
        phase: (rawProgress.phase || rawProgress.stage || 'rules') as ScanPhase,
        percent: rawProgress.percent ?? rawProgress.progress ?? 0,
        message: rawProgress.message || '',
      }
      dispatch({ type: 'UPDATE_PROGRESS', progress })
    })

    return unsubscribe
  }, [])

  // Single-file scan (mode-aware)
  const startScan = useCallback(async (filePath: string, mode: ScanMode = 'audit') => {
    if (!window.api) {
      dispatch({ type: 'SCAN_ERROR', error: 'Sidecar not available' })
      return
    }

    try {
      const rawInfo = await window.api.getFileInfo(filePath)
      const fileInfo: FileInfo = {
        success: rawInfo.success ?? true,
        fileName: rawInfo.fileName ?? rawInfo.name ?? '',
        fileSize: rawInfo.fileSize ?? 0,
        sheets: rawInfo.sheets ?? [],
        totalCells: rawInfo.totalCells ?? rawInfo.cellCount ?? 0,
      }

      dispatch({ type: 'START_SCAN', filePath, fileInfo, mode })

      if (mode === 'pii') {
        const rawResult = await window.api.analyzePii(filePath)
        if (!rawResult.success) {
          dispatch({ type: 'SCAN_ERROR', error: rawResult.error || 'PII analysis failed' })
          return
        }
        const result = mapPiiResult(filePath, fileInfo.fileName, rawResult as Record<string, unknown>)
        dispatch({ type: 'PII_COMPLETE', results: result })
      } else if (mode === 'extraction') {
        const rawResult = await window.api.analyzeExtraction(filePath)
        if (!rawResult.success) {
          dispatch({ type: 'SCAN_ERROR', error: rawResult.error || 'Extraction failed' })
          return
        }
        const result = mapExtractionResult(filePath, fileInfo.fileName, rawResult as Record<string, unknown>)
        dispatch({ type: 'EXTRACTION_COMPLETE', results: result })
      } else {
        const rawResult = await window.api.analyzeFile(filePath)
        if (!rawResult.success) {
          dispatch({ type: 'SCAN_ERROR', error: rawResult.error || 'Analysis failed' })
          return
        }
        const result = mapRawResult(filePath, fileInfo.fileName, rawResult as Record<string, unknown>)
        dispatch({ type: 'SCAN_COMPLETE', results: result })
      }
    } catch (err) {
      dispatch({
        type: 'SCAN_ERROR',
        error: err instanceof Error ? err.message : 'Analysis failed',
      })
    }
  }, [])

  // Test triggers: PII and extraction scans (test mode only)
  useEffect(() => {
    if (!window.api?.onTestTriggerPiiScan) return
    const unsubscribe = window.api.onTestTriggerPiiScan((filePath) => {
      startScan(filePath, 'pii')
    })
    return unsubscribe
  }, [startScan])

  useEffect(() => {
    if (!window.api?.onTestTriggerExtractionScan) return
    const unsubscribe = window.api.onTestTriggerExtractionScan((filePath) => {
      startScan(filePath, 'extraction')
    })
    return unsubscribe
  }, [startScan])

  // Batch scan — processes files sequentially
  const startBatchScan = useCallback(
    async (filePaths: Array<{ path: string; name: string; size: number }>) => {
      if (!window.api) {
        dispatch({ type: 'SCAN_ERROR', error: 'Sidecar not available' })
        return
      }

      const queuedFiles: QueuedFile[] = filePaths.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        status: 'pending' as const,
      }))

      dispatch({ type: 'START_BATCH', files: queuedFiles })

      for (let i = 0; i < queuedFiles.length; i++) {
        const file = queuedFiles[i]
        dispatch({ type: 'BATCH_FILE_START', index: i })

        try {
          const rawResult = await window.api.analyzeFile(file.path)

          if (!rawResult.success) {
            dispatch({
              type: 'BATCH_FILE_ERROR',
              index: i,
              error: rawResult.error || 'Analysis failed',
            })
            continue
          }

          const result = mapRawResult(file.path, file.name, rawResult as Record<string, unknown>)
          dispatch({ type: 'BATCH_FILE_COMPLETE', index: i, result })
        } catch (err) {
          dispatch({
            type: 'BATCH_FILE_ERROR',
            index: i,
            error: err instanceof Error ? err.message : 'Analysis failed',
          })
        }
      }

      dispatch({ type: 'BATCH_COMPLETE' })
    },
    []
  )

  // Select a specific file's results in batch mode
  const selectBatchFile = useCallback(
    (index: number) => {
      const file = state.batchFiles[index]
      if (file?.result) {
        dispatch({ type: 'SCAN_COMPLETE', results: file.result })
      }
    },
    [state.batchFiles]
  )

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  return (
    <ScanContext.Provider
      value={{ ...state, startScan, startBatchScan, selectBatchFile, reset }}
    >
      {children}
    </ScanContext.Provider>
  )
}

export function useScan(): ScanContextValue {
  return useContext(ScanContext)
}
