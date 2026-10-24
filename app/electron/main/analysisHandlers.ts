import { ipcMain, type WebContents } from 'electron'
import { normalize } from 'path'

import { analyzeExcel, analyzeExcelFromSheets } from '../engine/ruleEngine'
import { readWorkbook } from '../engine/excelReader'
import { scanForPiiFromSheets } from '../pii/scanner'
import { reviewAuditIssues, AuditReviewStopError, cancelLlmAnalysis, isLocalAiReadyFor, mergeJudgments } from '../llm/lifecycle'
import type { AuditReviewProgress } from '../../shared/auditReview'
import { AnalysisSessionManager, type AnalysisSession } from './analysisSession'
import { mapToLlmInput, orderAuditIssuesBySeverity } from './auditInput'

type EngineName = 'audit' | 'pii'
const sessions = new AnalysisSessionManager(cancelLlmAnalysis)
let modelMaintenance = false
export async function withModelMaintenance<T>(work: () => Promise<T>): Promise<T> {
  if (sessions.hasActive || modelMaintenance) throw new Error('Another analysis or model operation is active')
  modelMaintenance = true
  try { return await work() } finally { modelMaintenance = false }
}
export function hasActiveAnalysis(): boolean { return sessions.hasActive || modelMaintenance }
function isActive(scan: AnalysisSession): boolean { return sessions.isActive(scan) }
async function releaseWhenSettled(scan: AnalysisSession): Promise<void> { await sessions.settle(scan) }
function startSession(sender: WebContents, scanId: unknown): AnalysisSession | null {
  if (modelMaintenance) return null
  return typeof scanId === 'string' && scanId.length > 0 ? sessions.begin(sender, scanId) : null
}

function validateFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 1024) return false
  return !normalize(filePath).includes('\0')
}

function inactiveResult(scan: AnalysisSession) {
  return scan.stopFailed
    ? { success: false, errorCode: 'model-stop-failed' as const, error: 'Unable to stop local AI. Use Cancel to retry before starting another scan.' }
    : { success: false, error: 'Analysis cancelled' }
}

function sendEngineDone(
  sender: WebContents,
  scanId: string,
  engine: EngineName,
  payload: { result?: unknown; error?: string },
): void {
  if (!sender.isDestroyed()) sender.send('analyze:engine-done', { scanId, engine, ...payload })
}

function sendProgress(sender: WebContents, scanId: string, progress: AuditReviewProgress): void {
  if (!sender.isDestroyed()) sender.send('sidecar:scan-progress', {
    scanId, phase: 'ai', percent: progress.selected === 0 ? 100 : Math.round(progress.attempted / progress.selected * 100),
    message: '', auditReview: progress,
  })
}

async function enrichAudit(result: Awaited<ReturnType<typeof analyzeExcelFromSheets>>, scan: AnalysisSession, sender: WebContents) {
  if (result.issues.length === 0) return result
  // No installed model that reviews formulas: AI is not part of this scan. Return the
  // deterministic audit as-is, without review accounting, warning or AI progress.
  if (!isLocalAiReadyFor('audit')) return result

  try {
    const ordered = orderAuditIssuesBySeverity(result.issues)
    const { judgments, summary } = await reviewAuditIssues(mapToLlmInput(ordered), {
      onProgress: progress => { if (isActive(scan)) sendProgress(sender, scan.scanId, progress) },
    })
    if (!isActive(scan) || summary.stopReason === 'cancelled') return result

    const issues = mergeJudgments(
      result.issues.map((issue) => ({ ...issue, cellAddress: issue.cell })),
      judgments,
    )
    return { ...result, issues, auditReview: summary }
  } catch (error) {
    if (error instanceof AuditReviewStopError) {
      sessions.retainAfterStopFailure(scan)
      throw error
    }
    // The deterministic audit is still a valid result when local AI is unavailable.
    return {
      ...result,
      aiWarning: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Register the audit and unified analysis IPC endpoints. */
export function registerAnalysisHandlers(): void {
  ipcMain.handle('analyze:cancel', async (event, scanId: unknown) => {
    if (!await sessions.cancel(event.sender, scanId)) return { success: false, error: 'No matching active scan' }
    return { success: true }
  })
  ipcMain.handle('sidecar:analyze', async (event, filePath: string, scanId: string) => {
    if (!validateFilePath(filePath)) {
      return { success: false, error: 'Invalid path', issues: [], summary: { total: 0, error: 0, warning: 0, info: 0 } }
    }

    const scan = startSession(event.sender, scanId)
    if (!scan) return { success: false, error: hasActiveAnalysis() ? 'Another analysis is active' : 'Missing scan identity' }
    try {
      const result = await analyzeExcel(filePath)
      if (!isActive(scan)) return { success: false, error: 'Analysis cancelled' }
      const enriched = await enrichAudit(result, scan, event.sender)
      return isActive(scan) ? { success: true, ...enriched } : inactiveResult(scan)
    } catch (error) {
      return {
        ...(scan.stopFailed ? inactiveResult(scan) : {}),
        success: false,
        error: scan.stopFailed ? inactiveResult(scan).error : String(error),
        issues: [],
        summary: { total: 0, error: 0, warning: 0, info: 0 },
      }
    } finally { await releaseWhenSettled(scan) }
  })

  ipcMain.handle('analyze:all', async (event, filePath: string, scanId: string) => {
    if (!validateFilePath(filePath) || typeof scanId !== 'string' || scanId.length === 0) {
      return { success: false, error: 'Invalid analysis request' }
    }

    const scan = startSession(event.sender, scanId)
    if (!scan) return { success: false, error: hasActiveAnalysis() ? 'Another analysis is active' : 'Invalid analysis request' }
    try {
      const { sheets } = await readWorkbook(filePath)
      if (!isActive(scan)) return { success: false, error: 'Analysis cancelled' }
      const sender = event.sender

      const audit = analyzeExcelFromSheets(sheets)
        .then((result) => isActive(scan) ? enrichAudit(result, scan, sender) : null)
        .then((result) => { if (result && isActive(scan)) sendEngineDone(sender, scanId, 'audit', { result }) })
        .catch((error) => { if (isActive(scan)) sendEngineDone(sender, scanId, 'audit', { error: String(error) }) })

      const pii = scanForPiiFromSheets(sheets)
        .then((result) => {
          if (!isActive(scan)) return
          if (!result.success) throw new Error(result.error || 'PII analysis failed')
          sendEngineDone(sender, scanId, 'pii', { result })
        })
        .catch((error) => { if (isActive(scan)) sendEngineDone(sender, scanId, 'pii', { error: String(error) }) })

      await Promise.all([audit, pii])
      return isActive(scan) ? { success: true } : inactiveResult(scan)
    } catch (error) {
      return { success: false, error: String(error) }
    } finally { await releaseWhenSettled(scan) }
  })

}
