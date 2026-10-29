import { ipcMain, type WebContents } from 'electron'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { normalize } from 'path'

import { analyzeExcel, analyzeExcelFromSheets } from '../engine/ruleEngine'
import { readWorkbook } from '../engine/excelReader'
import { reviewAuditIssues, AuditReviewStopError, cancelLlmAnalysis, isLocalAiReadyFor, mergeJudgments } from '../llm/lifecycle'
import type { AuditReviewProgress } from '../../shared/auditReview'
import { AnalysisSessionManager, type AnalysisSession } from './analysisSession'
import { mapToLlmInput, orderAuditIssuesBySeverity } from './auditInput'

type EngineName = 'audit'
type AuditStage = 'rules' | 'complete'
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
  payload: { result?: unknown; error?: string; stage?: AuditStage; invalidate?: boolean },
): void {
  if (!sender.isDestroyed()) sender.send('analyze:engine-done', { scanId, engine, ...payload })
}

class SourceChangedError extends Error {
  constructor() { super('The workbook changed while it was being analyzed. Please scan it again.') }
}

async function fingerprint(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function ensureSameSource(filePath: string, expected: string): Promise<void> {
  if (await fingerprint(filePath) !== expected) throw new SourceChangedError()
}

function sendProgress(sender: WebContents, scanId: string, progress: AuditReviewProgress): void {
  if (!sender.isDestroyed()) sender.send('sidecar:scan-progress', {
    scanId, phase: 'ai', percent: progress.selected === 0 ? 100 : Math.round(progress.attempted / progress.selected * 100),
    message: '', auditReview: progress,
  })
}

async function enrichAudit(result: Awaited<ReturnType<typeof analyzeExcelFromSheets>> & { sourceFingerprint?: string }, scan: AnalysisSession, sender: WebContents) {
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

async function analyzeWorkbookProgressively(
  filePath: string,
  scan: AnalysisSession,
  sender: WebContents,
): Promise<void> {
  const sourceFingerprint = await fingerprint(filePath)
  const { sheets } = await readWorkbook(filePath)
  if (!isActive(scan)) return
  await ensureSameSource(filePath, sourceFingerprint)

  const audit = await analyzeExcelFromSheets(sheets)
  if (!isActive(scan)) return
  await ensureSameSource(filePath, sourceFingerprint)
  const rules = { ...audit, sourceFingerprint }

  // Rules are independently useful and must remain visible while optional local
  // AI review runs. The later event retains the same rule findings and only adds
  // review fields; it never substitutes an AI-only list.
  const reviewWillRun = rules.issues.length > 0 && isLocalAiReadyFor('audit')
  if (reviewWillRun) sendEngineDone(sender, scan.scanId, 'audit', { result: rules, stage: 'rules' })

  const enriched = reviewWillRun ? await enrichAudit(rules, scan, sender) : rules
  if (!isActive(scan)) return
  await ensureSameSource(filePath, sourceFingerprint)
  sendEngineDone(sender, scan.scanId, 'audit', { result: enriched, stage: 'complete' })
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
      const sourceFingerprint = await fingerprint(filePath)
      const result = await analyzeExcel(filePath)
      if (!isActive(scan)) return { success: false, error: 'Analysis cancelled' }
      await ensureSameSource(filePath, sourceFingerprint)
      const enriched = await enrichAudit({ ...result, sourceFingerprint }, scan, event.sender)
      await ensureSameSource(filePath, sourceFingerprint)
      return isActive(scan) ? { success: true, ...enriched, sourceFingerprint } : inactiveResult(scan)
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
      await analyzeWorkbookProgressively(filePath, scan, event.sender)
      return isActive(scan) ? { success: true } : inactiveResult(scan)
    } catch (error) {
      if (scan.stopFailed) return inactiveResult(scan)
      if (error instanceof SourceChangedError && isActive(scan)) {
        sendEngineDone(event.sender, scanId, 'audit', { error: error.message, stage: 'complete', invalidate: true })
      }
      return { success: false, error: String(error) }
    } finally { await releaseWhenSettled(scan) }
  })

}
