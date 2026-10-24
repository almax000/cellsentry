import { describe, expect, it } from 'vitest'
import { scanReducer } from '../src/context/ScanContext'

const fileInfo = { success: true, fileName: 'book.xlsx', fileSize: 1, sheets: [], totalCells: 0 }

function start(scanId = 'scan-current') {
  return scanReducer(undefined as never, { type: 'START_SCAN', filePath: '/book.xlsx', fileInfo, scanId })
}

describe('unified scan state identity', () => {
  it('drops progress after cancellation or completion, and from earlier files in a batch', () => {
    const progress = { phase: 'ai' as const, percent: 25, message: '' }
    const current = start('current')
    expect(scanReducer(current, { type: 'UPDATE_PROGRESS', scanId: 'old', progress })).toBe(current)
    const cancelled = scanReducer(current, { type: 'CANCEL_SCAN' })
    expect(scanReducer(cancelled, { type: 'UPDATE_PROGRESS', scanId: 'current', progress })).toBe(cancelled)
    const batch = scanReducer(current, { type: 'START_BATCH', files: [{ path: '/a', name: 'a', size: 1, status: 'pending' }] })
    const next = scanReducer(batch, { type: 'BATCH_FILE_START', index: 0, scanId: 'batch-file-2' })
    expect(scanReducer(next, { type: 'UPDATE_PROGRESS', scanId: 'batch-file-1', progress })).toBe(next)
    expect(scanReducer(next, { type: 'UPDATE_PROGRESS', scanId: 'batch-file-2', progress }).progress).toEqual(progress)
  })
  it('keeps a stop failure retryable and discards partial summary claims with a wrong denominator', () => {
    const error = scanReducer(start(), { type: 'SCAN_ERROR', error: 'Retry stopping', stopRetryRequired: true })
    expect(scanReducer(error, { type: 'CANCEL_REQUEST' }).scanState).toBe('cancelling')
    const state = scanReducer(start(), { type: 'ENGINE_DONE', scanId: 'scan-current', engine: 'audit', result: {
      issues: [{ severity: 'error' }], auditReview: { total: 200, selected: 20, attempted: 20, reviewed: 20, failed: 0, skipped: 180, stopReason: 'candidate-limit' },
    } })
    expect(state.results?.auditReview).toBeUndefined()
  })
  it('cancels the active identity so late events cannot restore old results', () => {
    const scanning = start('scan-cancelled')
    const cancelled = scanReducer(scanning, { type: 'CANCEL_SCAN' })
    const late = scanReducer(cancelled, {
      type: 'ENGINE_DONE', scanId: 'scan-cancelled', engine: 'audit', result: { issues: [], summary: {} },
    })
    expect(late).toBe(cancelled)
    expect(cancelled.scanState).toBe('idle')
  })
  it('ignores a delayed result from an earlier scan', () => {
    const current = start()
    const next = scanReducer(current, {
      type: 'START_SCAN', filePath: '/new.xlsx', fileInfo, scanId: 'scan-next',
    })

    const afterOldEvent = scanReducer(next, {
      type: 'ENGINE_DONE', scanId: 'scan-current', engine: 'audit', result: { issues: [], summary: {} },
    })

    expect(afterOldEvent).toBe(next)
  })

  it('counts audit and workbook PII once and only completes after both settle', () => {
    let state = start()
    state = scanReducer(state, {
      type: 'ENGINE_DONE', scanId: 'scan-current', engine: 'audit', result: { issues: [], summary: {} },
    })
    expect(state.enginesComplete).toBe(1)
    expect(state.scanState).toBe('scanning')

    const afterDuplicate = scanReducer(state, {
      type: 'ENGINE_DONE', scanId: 'scan-current', engine: 'audit', result: { issues: [], summary: {} },
    })
    expect(afterDuplicate).toBe(state)

    state = scanReducer(state, {
      type: 'ENGINE_DONE', scanId: 'scan-current', engine: 'pii', error: 'model unavailable',
    })

    expect(state.enginesComplete).toBe(2)
    expect(state.scanState).toBe('complete')
    expect(state.piiError).toBe('model unavailable')
  })
})

describe('batch result association', () => {
  it('keeps the selected result and its source path together after a later file fails', () => {
    let state = scanReducer(start(), { type: 'START_BATCH', files: [
      { path: '/first.xlsx', name: 'first.xlsx', size: 1, status: 'pending' },
      { path: '/broken.xlsx', name: 'broken.xlsx', size: 1, status: 'pending' },
    ] })
    const result = { success: true, filePath: '/first.xlsx', fileName: 'first.xlsx', issues: [], summary: { errors: 0, warnings: 0, info: 0, total: 0 }, scannedAt: '', duration: 0 }
    state = scanReducer(state, { type: 'BATCH_FILE_COMPLETE', index: 0, result })
    state = scanReducer(state, { type: 'BATCH_FILE_START', index: 1 })
    state = scanReducer(state, { type: 'BATCH_FILE_ERROR', index: 1, error: 'Invalid workbook' })
    state = scanReducer(state, { type: 'BATCH_COMPLETE' })
    expect(state.filePath).toBe(result.filePath)
    expect(state.batchIndex).toBe(0)
    expect(state.batchResults?.completedFiles).toBe(2)
    state = scanReducer(state, { type: 'SELECT_BATCH_FILE', index: 1 })
    expect(state.results).toBeNull()
    expect(state.scanState).toBe('error')
  })
  it('normalizes actual engine severity counts for the renderer', () => {
    const state = scanReducer(start(), { type: 'ENGINE_DONE', scanId: 'scan-current', engine: 'audit', result: {
      success: true, issues: [{ severity: 'error' }, { severity: 'warning' }], summary: { total: 2, error: 1, warning: 1, info: 0 },
    } })
    expect(state.results?.summary).toEqual({ errors: 1, warnings: 1, info: 0, total: 2 })
  })
  it('counts every scan start and failure, and keeps the counts through cancel and reset', () => {
    const first = start('a')
    expect(first).toMatchObject({ runSeq: 1, errorSeq: 0 })
    const failed = scanReducer(first, { type: 'SCAN_ERROR', error: 'Unreadable' })
    const failedAgain = scanReducer(failed, { type: 'SCAN_ERROR', error: 'Unreadable' })
    expect(failedAgain).toMatchObject({ scanState: 'error', error: 'Unreadable', runSeq: 1, errorSeq: 2 })
    const reset = scanReducer(failedAgain, { type: 'RESET' })
    expect(reset).toMatchObject({ scanState: 'idle', runSeq: 1, errorSeq: 2 })
    const cancelled = scanReducer(reset, { type: 'CANCEL_SCAN' })
    expect(cancelled).toMatchObject({ runSeq: 1, errorSeq: 2 })
    const second = scanReducer(cancelled, { type: 'START_SCAN', filePath: '/b.xlsx', fileInfo, scanId: 'b' })
    expect(second).toMatchObject({ scanState: 'scanning', runSeq: 2, errorSeq: 2 })
    const batch = scanReducer(second, { type: 'START_BATCH', files: [{ path: '/a', name: 'a', size: 1, status: 'pending' }] })
    expect(batch).toMatchObject({ isBatch: true, runSeq: 3, errorSeq: 2 })
  })
})
