/**
 * IPC for the redaction flow. Document text only moves between this process
 * and the window; nothing here touches the network.
 */
import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import { clearProfile, loadProfile, saveProfile } from './profileStore'
import { registerReadHandlers } from './readHandlers'
import { IS_TEST_MODE } from '../testMode'
import { OCR_ENABLED } from '../../shared/redact/features'

// While text recognition is paused (ADR-0013) the picker offers PDFs only; a dropped photo is explained on the reading page.
const DOCUMENT_EXTENSIONS = OCR_ENABLED ? ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'tif', 'tiff', 'bmp', 'webp'] : ['pdf']
// 50 files of 200 pages fit comfortably; anything larger is not a document.
const MAX_TEXT = 50_000_000

export function registerRedactIpc(): void {
  ipcMain.handle('redact:profile-load', () => loadProfile())
  ipcMain.handle('redact:profile-save', (_event, profile: unknown) => saveProfile(profile))
  ipcMain.handle('redact:profile-clear', () => clearProfile())

  ipcMain.handle('redact:open-documents', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: OCR_ENABLED ? 'PDF / Images' : 'PDF', extensions: DOCUMENT_EXTENSIONS }],
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('redact:save-text', async (event, text: unknown) => {
    if (typeof text !== 'string' || text.length > MAX_TEXT) return { ok: false, error: 'invalid' }
    const window = BrowserWindow.fromWebContents(event.sender)
    // A neutral default name: the original file names may themselves be personal.
    const options: Electron.SaveDialogOptions = { defaultPath: 'shareable.txt', filters: [{ name: 'Text', extensions: ['txt'] }] }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    try {
      await writeFile(result.filePath, text, 'utf8')
      return { ok: true }
    } catch {
      return { ok: false, error: 'write_failed' }
    }
  })

  ipcMain.handle('redact:copy-text', (_event, text: unknown): boolean => {
    if (typeof text !== 'string' || text.length > MAX_TEXT) return false
    // Automated runs must not overwrite the clipboard of the person using this Mac.
    if (IS_TEST_MODE) (globalThis as { __cellsentryTestClipboard?: string }).__cellsentryTestClipboard = text
    else clipboard.writeText(text)
    return true
  })

  registerReadHandlers()
}
