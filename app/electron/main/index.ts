import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { setEngineLocale } from '../engine/locale'
import { initManualUpdater, registerUpdaterIpc } from './updater'
import { setupLlmLifecycle, startLlm } from '../llm/lifecycle'
import { bootstrapBundledModel } from '../model/bundled'
import { getBundledModelDir, getModelsDir } from '../model/paths'

import { IS_TEST_MODE } from '../testMode'
// Automated runs keep the window off screen and never take focus from the person at the desk.
const IS_HIDDEN_TEST = IS_TEST_MODE && process.env.CELLSENTRY_TEST_HIDDEN === '1'

// Test runs own their application data; never read/write the user's model or settings.
if (IS_TEST_MODE && process.env.CELLSENTRY_TEST_USER_DATA) {
  mkdirSync(process.env.CELLSENTRY_TEST_USER_DATA, { recursive: true })
  app.setPath('userData', process.env.CELLSENTRY_TEST_USER_DATA)
}

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
      nodeIntegration: false,
      // Chromium's spell checker downloads dictionaries on some platforms; nothing here may go online for text.
      spellcheck: false,
      // A never-shown window must still run timers and animation frames at full speed.
      ...(IS_HIDDEN_TEST ? { backgroundThrottling: false } : {})
    }
  })

  // Known Electron bug: traffic lights shift after exiting fullscreen
  if (IS_MAC) {
    mainWindow.on('leave-full-screen', () => {
      mainWindow.setWindowButtonPosition({ x: TRAFFIC_LIGHT_X, y: TRAFFIC_LIGHT_Y })
    })
  }

  mainWindow.on('ready-to-show', () => {
    if (IS_HIDDEN_TEST) return
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
    // A hidden test run must never take focus.
    if (win && !IS_HIDDEN_TEST) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // No Dock icon or menu bar, and the app never becomes frontmost.
    if (IS_HIDDEN_TEST && process.platform === 'darwin') app.setActivationPolicy('accessory')
    setEngineLocale(app.getLocale())
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
              + " connect-src 'self';"
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

    // Core analysis is available immediately; AI setup is optional in Settings.
    const mainWindow = createWindow()

    // Register zoom handlers once (not inside createWindow to avoid duplicate registration)
    ipcMain.handle('zoom:get', () => mainWindow.webContents.getZoomLevel())
    ipcMain.handle('zoom:set', (_event, level: number) => {
      const clamped = Math.max(-3, Math.min(3, level))
      mainWindow.webContents.setZoomLevel(clamped)
    })

    initManualUpdater(mainWindow)

    // Open the rules-only workspace first. The offline payload is staged and
    // verified in the background; LLM IPC stays gated until that is complete.
    const shouldBootstrap = app.isPackaged && (!IS_TEST_MODE || process.env.CELLSENTRY_TEST_BUNDLED_MODEL === '1')
    if (shouldBootstrap) {
      const controller = new AbortController()
      const abort = (): void => controller.abort()
      app.once('before-quit', abort)
      void bootstrapBundledModel({ packageDir: getBundledModelDir(), modelsDir: getModelsDir(), signal: controller.signal })
        .catch((error) => {
          if (!controller.signal.aborted) console.warn('[offline-model]', error instanceof Error ? error.message : 'Offline model installation failed')
        })
        .finally(() => {
          app.removeListener('before-quit', abort)
          if (!controller.signal.aborted && !IS_TEST_MODE) startLlm().catch(() => {})
        })
    } else if (!IS_TEST_MODE) {
      // Lean updates and development builds have no bundled payload to stage.
      startLlm().catch(() => {})
    }

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
