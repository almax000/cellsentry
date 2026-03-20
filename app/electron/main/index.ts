import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, getDownloader } from './ipc'
import { setEngineLocale } from '../engine/locale'
import { initAutoUpdater, registerUpdaterIpc } from './updater'
import { setupLlmLifecycle, startLlm } from '../llm/lifecycle'

const IS_TEST_MODE = process.env.CELLSENTRY_TEST_MODE === '1'

// ---------------------------------------------------------------------------
// Crash Logging
// ---------------------------------------------------------------------------

function logCrash(label: string, err: unknown): void {
  try {
    const logsDir = join(app.getPath('userData'), 'crash-logs')
    mkdirSync(logsDir, { recursive: true })
    const timestamp = new Date().toISOString()
    const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    appendFileSync(join(logsDir, 'crash.log'), `[${timestamp}] ${label}: ${message}\n\n`)
  } catch { /* ignore logging failures */ }
}

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
  logCrash('uncaughtException', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
  logCrash('unhandledRejection', reason)
})

function registerTestIpcHandlers(): void {
  if (!IS_TEST_MODE) return

  ipcMain.handle('test:get-router-path', (event) => {
    return event.sender.executeJavaScript('window.location.hash.replace("#", "") || "/"')
  })

  ipcMain.handle('test:get-scan-state', (event) => {
    return event.sender.executeJavaScript(
      'document.querySelector("[data-scan-state]")?.getAttribute("data-scan-state") || "unknown"'
    )
  })

  ipcMain.handle('test:trigger-analysis', async (event, filePath: string) => {
    event.sender.send('test:trigger-analysis', filePath)
  })

  ipcMain.on('test:trigger-pii-scan', (event, filePath: string) => {
    event.sender.send('test:trigger-pii-scan', filePath)
  })

  ipcMain.on('test:trigger-extraction-scan', (event, filePath: string) => {
    event.sender.send('test:trigger-extraction-scan', filePath)
  })

  ipcMain.on('test:reset-state', (event) => {
    event.sender.send('test:reset-state')
  })
}


// ---------------------------------------------------------------------------
// Window State Persistence
// ---------------------------------------------------------------------------

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const WINDOW_STATE_FILE = join(app.getPath('userData'), 'window-state.json')
const DEFAULT_WINDOW_STATE: WindowState = { width: 1200, height: 800, isMaximized: false }

function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(WINDOW_STATE_FILE, 'utf-8')
    const state = JSON.parse(raw) as WindowState

    // Validate that saved position is still within an available display
    if (state.x !== undefined && state.y !== undefined) {
      const displays = screen.getAllDisplays()
      const visible = displays.some((display) => {
        const { x, y, width, height } = display.bounds
        return (
          state.x! >= x - 100 &&
          state.x! < x + width + 100 &&
          state.y! >= y - 100 &&
          state.y! < y + height + 100
        )
      })
      if (!visible) {
        return { width: state.width, height: state.height, isMaximized: state.isMaximized }
      }
    }

    return state
  } catch {
    return { ...DEFAULT_WINDOW_STATE }
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: win.isMaximized()
    }
    writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2))
  } catch {
    // Silently ignore write errors (e.g. disk full, permissions)
  }
}

// ---------------------------------------------------------------------------
// App Menu
// ---------------------------------------------------------------------------

function createAppMenu(): void {
  const IS_MAC = process.platform === 'darwin'

  const editSubmenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' }
  ]

  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
    ...(is.dev ? [
      { role: 'reload' as const },
      { role: 'forceReload' as const },
      { role: 'toggleDevTools' as const },
      { type: 'separator' as const },
    ] : []),
    {
      label: 'Actual Size',
      accelerator: 'CmdOrCtrl+0',
      click: (): void => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) win.webContents.send('zoom:change', 0)
      }
    },
    {
      label: 'Zoom In',
      accelerator: 'CmdOrCtrl+=',
      click: (): void => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) win.webContents.send('zoom:change', 1)
      }
    },
    {
      label: 'Zoom Out',
      accelerator: 'CmdOrCtrl+-',
      click: (): void => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) win.webContents.send('zoom:change', -1)
      }
    },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  ]

  const windowSubmenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'minimize' },
    { role: 'zoom' },
    ...(IS_MAC
      ? [{ type: 'separator' as const }, { role: 'front' as const }]
      : [{ role: 'close' as const }])
  ]

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(IS_MAC
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    { label: 'Edit', submenu: editSubmenu },
    { label: 'View', submenu: viewSubmenu },
    { label: 'Window', submenu: windowSubmenu }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ---------------------------------------------------------------------------
// Download Window (shown before main window when model is missing)
// ---------------------------------------------------------------------------

function createDownloadWindow(): BrowserWindow {
  const IS_MAC = process.platform === 'darwin'
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const WIN_W = 550, WIN_H = 420

  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: Math.round((width - WIN_W) / 2),
    y: Math.round((height - WIN_H) / 2),
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: 14, y: 14 } }
      : {
          titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#666666',
            height: 40
          }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  // Load same renderer but with ?download=1 query param
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?download=1')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { download: '1' } })
  }

  return win
}

// ---------------------------------------------------------------------------
// Main Window
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const IS_MAC = process.platform === 'darwin'
  const HEADER_HEIGHT = 48
  const TRAFFIC_LIGHT_X = 12
  const TRAFFIC_LIGHT_Y = Math.floor((HEADER_HEIGHT - 16) / 2) // 16

  const savedState = loadWindowState()

  const mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    ...(savedState.x !== undefined && savedState.y !== undefined
      ? { x: savedState.x, y: savedState.y }
      : {}),
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: { x: TRAFFIC_LIGHT_X, y: TRAFFIC_LIGHT_Y } }
      : {
          titleBarOverlay: {
            color: '#0f1117',
            symbolColor: '#8b8f9a',
            height: HEADER_HEIGHT
          }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Known Electron bug: traffic lights shift after exiting fullscreen
  if (IS_MAC) {
    mainWindow.on('leave-full-screen', () => {
      mainWindow.setWindowButtonPosition({ x: TRAFFIC_LIGHT_X, y: TRAFFIC_LIGHT_Y })
    })
  }

  mainWindow.on('ready-to-show', () => {
    if (savedState.isMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
  })

  // Persist window bounds on close
  mainWindow.on('close', () => {
    saveWindowState(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Prevent renderer from navigating to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ---------------------------------------------------------------------------
// Single-Instance Lock
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    setEngineLocale(process.env.CELLSENTRY_FORCE_LOCALE || app.getLocale())
    electronApp.setAppUserModelId('com.cellsentry.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Dock icon for dev mode on macOS
    if (process.platform === 'darwin' && is.dev) {
      app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
    }

    // Content Security Policy (production only — Vite dev needs inline scripts)
    if (!is.dev) {
      const { session } = require('electron')
      session.defaultSession.webRequest.onHeadersReceived((details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self';"
              + " script-src 'self';"
              + " style-src 'self' 'unsafe-inline';"
              + " img-src 'self' data: blob:;"
              + " font-src 'self' data:;"
              + " connect-src 'self' https://github.com https://*.github.com;"
            ]
          }
        })
      })
    }

    createAppMenu()
    registerIpcHandlers()
    registerTestIpcHandlers()
    registerUpdaterIpc()
    setupLlmLifecycle()

    // Gate: check model before creating the main window
    const skipModelCheck = IS_TEST_MODE
    const downloader = getDownloader()
    const modelExists = skipModelCheck || downloader.checkModelExists()

    if (!modelExists) {
      const dlWin = createDownloadWindow()

      await new Promise<void>((resolve) => {
        let downloadConfirmed = false

        ipcMain.once('model:download-complete', () => {
          downloadConfirmed = true
          dlWin.close()
          resolve()
        })
        // If user force-quits the download window, exit the app
        dlWin.on('closed', () => {
          if (downloadConfirmed) return
          if (!downloader.checkModelExists()) {
            app.quit()
          } else {
            resolve()
          }
        })
      })
    }

    const mainWindow = createWindow()

    // Register zoom handlers once (not inside createWindow to avoid duplicate registration)
    ipcMain.handle('zoom:get', () => mainWindow.webContents.getZoomLevel())
    ipcMain.handle('zoom:set', (_event, level: number) => {
      const clamped = Math.max(-3, Math.min(3, level))
      mainWindow.webContents.setZoomLevel(clamped)
    })

    if (!is.dev) {
      initAutoUpdater(mainWindow)
    }

    // Start LLM in background (model is guaranteed present now)
    startLlm().catch(() => {})

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
