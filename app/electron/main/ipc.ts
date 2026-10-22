/**
 * IPC handler registration — replaces fetchSidecar HTTP calls with direct TS calls.
 *
 * Each handler maps to a former Python sidecar endpoint.
 */

import { app, ipcMain, dialog, shell } from 'electron'
import { readdirSync, statSync, appendFileSync, mkdirSync, readFileSync } from 'fs'
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


import { getFileInfo, readFileCells } from '../engine/excelReader'
import { generateReport } from '../report/generator'
import { ModelDownloader, DEFAULT_MODEL } from '../model/downloader'
import { importModelFile } from '../model/importer'
import { modelDownloadFailure } from '../model/downloadFailure'
import { getModelsDir } from '../model/paths'
export { getModelsDir } from '../model/paths'
import { getLlmStatus, analyzeWithLlm, startLlm, cancelLlmAnalysis } from '../llm/lifecycle'
import { hasActiveAnalysis, registerAnalysisHandlers, withModelMaintenance } from './analysisHandlers'
import { registerLocaleIpc } from './localeIpc'
import { registerRedactIpc } from '../redact/ipc'
import { exportAudit, redactPii, exportExtraction } from './exportHandlers'
import type { AuditExportRequest, PiiRedactionRequest, ExtractionExportRequest } from '../../shared/export'

function validateFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  if (filePath.length > 1024) return false
  const normalized = normalize(filePath)
  if (normalized.includes('\0')) return false
  return true
}

let modelDownloader: ModelDownloader | null = null



export function getDownloader(): ModelDownloader {
  if (!modelDownloader) {
    const { app } = require('electron') as typeof import('electron')
    modelDownloader = new ModelDownloader(getModelsDir(), undefined, app.getLocale())
  }
  return modelDownloader
}

export function registerIpcHandlers(): void {
  registerAnalysisHandlers()
  registerLocaleIpc()
  registerRedactIpc()
  ipcMain.handle('audit:export', (_event, request: AuditExportRequest) => exportAudit(request))
  ipcMain.handle('pii:redact', (_event, request: PiiRedactionRequest) => redactPii(request))
  ipcMain.handle('extraction:export', (_event, request: ExtractionExportRequest) => exportExtraction(request))

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
    const extensions = new Set(['.xlsx', '.csv'])
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
  ipcMain.handle('sidecar:model-import', async () => {
    try {
      return await withModelMaintenance(async () => {
        const chosen = await dialog.showOpenDialog({ properties: ['openFile'],
          filters: [{ name: 'GGUF model', extensions: ['gguf'] }] })
        if (chosen.canceled || !chosen.filePaths[0]) return { success: false, cancelled: true }
        await cancelLlmAnalysis()
        await importModelFile(chosen.filePaths[0], getDownloader().getModelPath(), DEFAULT_MODEL.size, DEFAULT_MODEL.sha256)
        return { success: true }
      })
    } catch (error) { return { success: false, error: String(error) } }
  })
  ipcMain.handle('sidecar:model-check', async () => {
    const downloader = getDownloader()
    return { exists: downloader.checkModelExists() }
  })

  ipcMain.handle('sidecar:model-download', async (event) => {
    try {
      return await withModelMaintenance(async () => {
        await cancelLlmAnalysis()
        const downloader = getDownloader()
        const sender = event.sender
        downloader.setProgressCallback((downloaded, total, message) => {
          if (!sender.isDestroyed()) sender.send('sidecar:model-download-progress', {
            downloaded, total, message, percent: total > 0 ? Math.round(downloaded * 100 / total) : 0
          })
        })
        const onClose = (): void => downloader.cancel()
        sender.once('destroyed', onClose)
        try { return { success: await downloader.download() } }
        finally { sender.removeListener('destroyed', onClose) }
      })
    } catch (error) {
      return modelDownloadFailure(error)
    }
  })
  ipcMain.handle('sidecar:model-download-cancel', () => getDownloader().cancel())

  // ── Health ──────────────────────────────────────────────
  ipcMain.handle('sidecar:health', async () => {
    return { status: 'ok', engine: 'typescript', version: app.isPackaged ? app.getVersion() : JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).version }
  })

  ipcMain.handle('sidecar:model-status', async () => {
    const status = await getLlmStatus()
    return {
      exists: getDownloader().checkModelExists(),
      loaded: status.modelLoaded,
      available: status.available,
      backend: status.backend,
      name: DEFAULT_MODEL.name,
      size: `${Math.round(DEFAULT_MODEL.size / 1024 / 1024)} MiB`,
      reason: status.reason,
      error: status.error,
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
    if (hasActiveAnalysis()) return { available: false, backend: 'none', modelLoaded: false, reason: 'busy', error: 'Another analysis or model operation is active' }
    try {
      return await startLlm()
    } catch {
      return { available: false, backend: 'none', modelLoaded: false }
    }
  })

  // ── File Dialogs ────────────────────────────────────────
  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheets', extensions: ['xlsx', 'csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:open-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Spreadsheets', extensions: ['xlsx', 'csv'] },
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
