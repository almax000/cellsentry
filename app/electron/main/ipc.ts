/**
 * IPC handler registration — replaces fetchSidecar HTTP calls with direct TS calls.
 *
 * Each handler maps to a former Python sidecar endpoint.
 */

import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readdirSync, statSync, existsSync, appendFileSync, mkdirSync } from 'fs'
import { join, extname, normalize } from 'path'

/** Write diagnostic error to crash-logs for remote debugging */
function logIpcError(handler: string, filePath: string, error: unknown): void {
  try {
    const logsDir = join(app.getPath('userData'), 'crash-logs')
    mkdirSync(logsDir, { recursive: true })
    const ts = new Date().toISOString()
    const msg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
    appendFileSync(
      join(logsDir, 'ipc-errors.log'),
      `[${ts}] ${handler} | path=${filePath} | ${msg}\n\n`
    )
  } catch { /* ignore */ }
}


import { analyzeExcel, type RendererIssue } from '../engine/ruleEngine'
import { getFileInfo, readFileCells } from '../engine/excelReader'
import { generateReport } from '../report/generator'
import { ModelDownloader } from '../model/downloader'
import { scanForPii } from '../pii/scanner'
import { redactFile } from '../pii/redactor'
import { extractDocument } from '../extraction/extractor'
import { exportToJson, exportToCsv } from '../extraction/exporters'
import { getLlmStatus, analyzeWithLlm, mergeJudgments, startLlm } from '../llm/lifecycle'
import type { LlmIssueInput } from '../llm/types'

function validateFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  if (filePath.length > 1024) return false
  const normalized = normalize(filePath)
  if (normalized.includes('\0')) return false
  return true
}

let modelDownloader: ModelDownloader | null = null

export function getModelsDir(): string {
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'models')
}

export function getDownloader(): ModelDownloader {
  if (!modelDownloader) {
    const { app } = require('electron') as typeof import('electron')
    modelDownloader = new ModelDownloader(getModelsDir(), undefined, app.getLocale())
  }
  return modelDownloader
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows[0] || null
}

function sendProgress(phase: string, percent: number): void {
  const win = getMainWindow()
  if (win) {
    win.webContents.send('sidecar:scan-progress', { phase, percent, message: '' })
  }
}

/** Map RendererIssue confidence string → number */
function confidenceToNumber(c: string): number {
  switch (c) {
    case 'high': return 0.9
    case 'medium': return 0.7
    case 'low': return 0.5
    default: return 0.7
  }
}

/** Map RendererIssue[] → LlmIssueInput[] for the LLM bridge */
function mapToLlmInput(issues: RendererIssue[]): LlmIssueInput[] {
  return issues.map((i) => ({
    ruleId: i.ruleId,
    cellAddress: i.cell,
    sheetName: i.sheet,
    formula: i.formula || '',
    message: i.message,
    confidence: confidenceToNumber(i.confidence),
  }))
}

export function registerIpcHandlers(): void {
  // ── Analysis ────────────────────────────────────────────
  ipcMain.handle('sidecar:analyze', async (_event, filePath: string) => {
    if (!validateFilePath(filePath)) {
      return { success: false, error: 'Invalid path', issues: [], summary: { total: 0, error: 0, warning: 0, info: 0 } }
    }
    try {
      // Phase 1: Rule engine
      const result = await analyzeExcel(filePath)
      sendProgress('rules', 100)

      // Phase 2: LLM verification
      let enrichedIssues = result.issues as Array<RendererIssue & {
        llmVerified?: boolean
        llmConfidence?: number
        llmReasoning?: string
      }>

      if (result.issues.length > 0) {
        sendProgress('ai', 0)
        const llmInput = mapToLlmInput(result.issues)
        const judgments = await analyzeWithLlm(llmInput)

        if (judgments.length > 0) {
          const issuesForMerge = result.issues.map((i) => ({
            ...i,
            cellAddress: i.cell,
          }))
          enrichedIssues = mergeJudgments(issuesForMerge, judgments)
        }
        sendProgress('ai', 100)
      }

      return {
        success: true,
        issues: enrichedIssues,
        summary: result.summary,
        sheets: result.sheets,
      }
    } catch (e) {
      logIpcError('sidecar:analyze', filePath, e)
      return { success: false, error: String(e), issues: [], summary: { total: 0, error: 0, warning: 0, info: 0 } }
    }
  })

  // ── File Info ───────────────────────────────────────────
  ipcMain.handle('sidecar:file-info', async (_event, filePath: string) => {
    if (!validateFilePath(filePath)) return { success: false, error: 'Invalid path' }
    const result = await getFileInfo(filePath)
    if (!result.success) logIpcError('sidecar:file-info', filePath, result.error || 'unknown')
    return result
  })

  // ── File Cells ──────────────────────────────────────────
  ipcMain.handle('sidecar:file-cells', async (_event, filePath: string, sheet: string, range: string) => {
    if (!validateFilePath(filePath)) return { success: false, error: 'Invalid path' }
    return readFileCells(filePath, sheet, range)
  })

  // ── Open File in System App ───────────────────────────────
  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    if (!validateFilePath(filePath)) return { success: false, error: 'Invalid path' }
    const result = await shell.openPath(filePath)
    return { success: !result, error: result || undefined }
  })

  // ── Report ──────────────────────────────────────────────
  ipcMain.handle('sidecar:report-generate', async (_event, data: { issues: unknown[]; fileName: string }) => {
    const issues = (data.issues || []).map((i: unknown) => {
      const issue = i as Record<string, unknown>
      return {
        sheet_name: String(issue.sheet || issue.sheet_name || ''),
        cell_address: String(issue.cell || issue.cell_address || ''),
        severity: String(issue.severity || 'low'),
        message: String(issue.message || ''),
        suggestion: String(issue.suggestion || ''),
      }
    })
    const html = generateReport(issues, data.fileName)
    return html
  })

  // ── Folder Scan ─────────────────────────────────────────
  ipcMain.handle('sidecar:scan-folder', async (_event, folderPath: string) => {
    if (!validateFilePath(folderPath)) {
      return { success: false, error: 'Invalid path', files: [], total: 0 }
    }
    const extensions = new Set(['.xlsx', '.xls', '.csv'])
    const files: Array<{ path: string; name: string; size: number }> = []

    function walk(dir: string, depth = 0): void {
      if (depth > 5) return
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1)
          } else if (extensions.has(extname(entry.name).toLowerCase())) {
            files.push({ path: fullPath, name: entry.name, size: statSync(fullPath).size })
          }
        }
      } catch { /* skip inaccessible dirs */ }
    }

    try {
      walk(folderPath)
      return { success: true, files, total: files.length }
    } catch (e) {
      return { success: false, error: String(e), files: [], total: 0 }
    }
  })

  // ── Model ───────────────────────────────────────────────
  ipcMain.handle('sidecar:model-check', async () => {
    if (process.env.CELLSENTRY_TEST_MODE === '1') {
      return { exists: true }
    }
    const downloader = getDownloader()
    return { exists: downloader.checkModelExists() }
  })

  ipcMain.handle('sidecar:model-download', async () => {
    const downloader = getDownloader()
    const win = BrowserWindow.getAllWindows()[0]

    if (win) {
      downloader.setProgressCallback((downloaded, total, message) => {
        if (!win.isDestroyed()) {
          win.webContents.send('sidecar:model-download-progress', {
            downloaded,
            total,
            message,
            percent: total > 0 ? Math.round((downloaded * 100) / total) : 0,
          })
        }
      })

      // Cancel download if window closes
      const onClose = (): void => { downloader.cancel() }
      win.once('closed', onClose)

      try {
        const success = await downloader.download()
        win.removeListener('closed', onClose)
        return { success }
      } catch (e) {
        win.removeListener('closed', onClose)
        return { success: false, error: String(e) }
      }
    }

    try {
      const success = await downloader.download()
      return { success }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── Health ──────────────────────────────────────────────
  ipcMain.handle('sidecar:health', async () => {
    return { status: 'ok', engine: 'typescript', version: app.getVersion() }
  })

  ipcMain.handle('sidecar:model-status', async () => {
    const downloader = getDownloader()
    return {
      loaded: downloader.checkModelExists(),
      backend: process.platform === 'darwin' ? 'mlx' : 'llama-cpp',
    }
  })

  // ── LLM ───────────────────────────────────────────────
  ipcMain.handle('llm:status', async () => {
    try {
      return await getLlmStatus()
    } catch {
      return { available: false, backend: 'none', modelLoaded: false }
    }
  })

  ipcMain.handle('llm:analyze', async (_event, issues: unknown[]) => {
    try {
      return await analyzeWithLlm(issues as Parameters<typeof analyzeWithLlm>[0])
    } catch (e) {
      return { error: String(e), judgments: [] }
    }
  })

  ipcMain.handle('llm:start', async () => {
    try {
      return await startLlm()
    } catch {
      return { available: false, backend: 'none', modelLoaded: false }
    }
  })

  // ── PII ───────────────────────────────────────────────
  ipcMain.handle('pii:analyze', async (_event, filePath: string) => {
    if (!validateFilePath(filePath)) {
      return { success: false, error: 'Invalid path' }
    }
    try {
      const result = await scanForPii(filePath)
      if (!result.success) logIpcError('pii:analyze', filePath, result.error || 'unknown')
      return result
    } catch (e) {
      logIpcError('pii:analyze', filePath, e)
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('pii:redact', async (_event, filePath: string, outputPath: string) => {
    if (!validateFilePath(filePath) || !validateFilePath(outputPath)) {
      return { success: false, error: 'Invalid path' }
    }
    try {
      return await redactFile(filePath, outputPath)
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  // ── Extraction ────────────────────────────────────────
  ipcMain.handle('extraction:analyze', async (_event, filePath: string) => {
    if (!validateFilePath(filePath)) {
      return { success: false, error: 'Invalid path' }
    }
    try {
      const result = await extractDocument(filePath)
      if (!result.success) logIpcError('extraction:analyze', filePath, result.error || 'unknown')
      return result
    } catch (e) {
      logIpcError('extraction:analyze', filePath, e)
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('extraction:export', async (_event, _filePath: string, format: string, _outputPath: string) => {
    // Export is handled client-side with data from the analysis result.
    // This handler is a placeholder for future server-side export if needed.
    return { success: false, error: `Server-side export not implemented for format: ${format}` }
  })

  // ── File Dialogs ────────────────────────────────────────
  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:open-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
