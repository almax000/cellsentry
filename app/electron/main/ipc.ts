/**
 * IPC handler registration for CellSentry v2.0 (medical pseudonymization).
 *
 * v1.x audit/PII/extraction handlers removed. v2 medical handlers will be
 * added in W1 Step 1.2 (medical/ scaffold) and W2-W3 (real implementations).
 */

import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join, normalize } from 'path'

import { ModelDownloader } from '../model/downloader'
import { OCR_MODEL_V2 } from '../model/registry'
import { getLlmStatus, analyzeWithLlm, startLlm } from '../llm/lifecycle'

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

function validateFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  if (filePath.length > 1024) return false
  const normalized = normalize(filePath)
  if (normalized.includes('\0')) return false
  return true
}

let modelDownloader: ModelDownloader | null = null

export function getModelsDir(): string {
  return join(app.getPath('userData'), 'models')
}

export function getDownloader(): ModelDownloader {
  if (!modelDownloader) {
    // OCR_MODEL_V2 is the W1 default; W2 will introduce a multi-model
    // orchestration that downloads OCR + safety-net in sequence. Until then,
    // OCR_MODEL_V2.files is empty (registry placeholder), which makes
    // checkModelExists() return true vacuously and download() a no-op success.
    // The app launches in stub-only mode without forcing a download dialog.
    modelDownloader = new ModelDownloader(getModelsDir(), OCR_MODEL_V2, app.getLocale())
  }
  return modelDownloader
}

export function registerIpcHandlers(): void {
  // ── Health (kept for ConnectionBanner / backward compat) ─────────
  ipcMain.handle('sidecar:health', async () => {
    return { status: 'ok', engine: 'typescript', version: app.getVersion() }
  })

  // ── Model lifecycle (will be refactored in Step 1.3 for multi-model) ─
  ipcMain.handle('sidecar:model-check', async () => {
    if (process.env.CELLSENTRY_TEST_MODE === '1') return { exists: true }
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

  ipcMain.handle('sidecar:model-status', async () => {
    const downloader = getDownloader()
    return {
      loaded: downloader.checkModelExists(),
      backend: process.platform === 'darwin' ? 'mlx' : 'llama-cpp',
    }
  })

  // ── LLM bridge (v2 will use this for safety-net pass + OCR) ──────
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

  // ── Shell / dialogs (kept) ───────────────────────────────────────
  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    if (!validateFilePath(filePath)) return { success: false, error: 'Invalid path' }
    const result = await shell.openPath(filePath)
    return { success: !result, error: result || undefined }
  })

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:open-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'txt'] },
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

  // ── Medical pipeline (v2). Stubs only — real implementations land W3-W4. ─
  //
  // Each handler invokes the corresponding stub in `electron/medical/*` which
  // throws `TODO: ...` with the milestone tag. We catch and return `{error: ...}`
  // so renderer code can render a clear "not yet implemented" state instead of
  // crashing on uncaught IPC rejections. Once real implementations land, the
  // throw paths go away naturally.

  ipcMain.handle('medical:ingest', async (_event, source: unknown) => {
    try {
      const { runPipeline } = await import('../medical/pipeline/orchestrator')
      // Stub forwards to orchestrator; orchestrator throws TODO until W2-W4.
      // Renderer should treat the error response as "feature not ready."
      return await runPipeline({ source: source as never, mapping_path: '', preview_only: true })
    } catch (e) {
      logIpcError('medical:ingest', '', e)
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('medical:scan-collisions', async (_event, mappingPath: unknown, chunks: unknown) => {
    try {
      const { scanForCollisions } = await import('../medical/mapping/collisionScan')
      const { loadMapping } = await import('../medical/mapping/parser')
      if (typeof mappingPath !== 'string' || !Array.isArray(chunks)) {
        return { error: 'medical:scan-collisions invalid args' }
      }
      const mapping = await loadMapping(mappingPath)
      return scanForCollisions({ mapping, chunks: chunks as string[] })
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('medical:preview', async (_event, request: unknown) => {
    try {
      const { runPipeline } = await import('../medical/pipeline/orchestrator')
      return await runPipeline({ ...(request as object), preview_only: true } as never)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('medical:redact', async (_event, request: unknown) => {
    try {
      const { runPipeline } = await import('../medical/pipeline/orchestrator')
      return await runPipeline({ ...(request as object), preview_only: false } as never)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('medical:get-audit-log', async (_event, archiveDir: unknown, limit: unknown) => {
    try {
      const { readAuditLog } = await import('../medical/audit/logger')
      if (typeof archiveDir !== 'string') return { error: 'medical:get-audit-log invalid archiveDir' }
      const lim = typeof limit === 'number' ? limit : undefined
      return await readAuditLog(archiveDir, lim)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('medical:export-map', async (_event, mappingPath: unknown, destPath: unknown) => {
    try {
      if (typeof mappingPath !== 'string' || typeof destPath !== 'string') {
        return { success: false, error: 'medical:export-map invalid args' }
      }
      // Real impl in W4: copy mapping to destPath with permission gates + audit entry.
      return { success: false, error: 'TODO: W4 — export-map not implemented' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── Defensive: silence error logs for handlers that may not exist on v1->v2 boundary
  void logIpcError
}
