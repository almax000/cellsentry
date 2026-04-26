import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // v2 W4 Step 4.5 / Warning N2: `allowPrerelease` is a runtime AppUpdater
  // property, NOT an electron-builder.yml field. We set it to false so v2+
  // users don't auto-jump from a stable 2.0.0 to a future 2.x-beta. Note:
  // this only constrains v2+ code; v1.1.0-beta.1 install base already has
  // prerelease enabled by default (their installed version itself contains a
  // prerelease tag). Migration sequencing — release v1.1.1 stable first, wait
  // 48-72h for auto-update propagation, THEN tag v2.0.0-beta.1 — protects
  // most v1 users from automatic v2 jump. Edge cases see V2UpgradeBanner.
  autoUpdater.allowPrerelease = false

  autoUpdater.logger = {
    info: (msg: string) => console.log('[updater]', msg),
    warn: (msg: string) => console.warn('[updater]', msg),
    error: (msg: string) => console.error('[updater]', msg),
    debug: (msg: string) => console.log('[updater:debug]', msg),
  }

  function send(status: UpdateStatus): void {
    mainWindow.webContents.send('updater:status', status)
  }

  autoUpdater.on('checking-for-update', () => {
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send({ status: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send({ status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    send({ status: 'error', error: err.message })
  })

  // Auto-check 30s after startup (silent, non-intrusive)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 30_000)
}

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      return await autoUpdater.checkForUpdates()
    } catch (err) {
      // If initAutoUpdater wasn't called (dev mode) or no releases exist,
      // fire the error status manually so the UI gets feedback
      const windows = BrowserWindow.getAllWindows()
      if (windows[0]) {
        const message = err instanceof Error ? err.message : String(err)
        const isNoRelease = message.includes('404') || message.includes('No published versions')
          || message.includes('net::ERR') || message.includes('ENOTFOUND')
        windows[0].webContents.send('updater:status', {
          status: 'error',
          error: isNoRelease ? 'No releases published yet' : message,
        } satisfies UpdateStatus)
      }
    }
  })

  ipcMain.handle('updater:download', async () => {
    return autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })
}
