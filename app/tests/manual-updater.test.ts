import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const state = vi.hoisted(() => ({
  handlers: new Map<string, () => Promise<unknown>>(),
  listeners: new Map<string, (...args: any[]) => void>(),
  updater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: undefined as unknown,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalWindowsStore = Object.getOwnPropertyDescriptor(process, 'windowsStore')

function setWindowsStoreChannel(enabled: boolean): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
  Object.defineProperty(process, 'windowsStore', { configurable: true, value: enabled })
}

function restoreProcessChannel(): void {
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  if (originalWindowsStore) Object.defineProperty(process, 'windowsStore', originalWindowsStore)
  else delete (process as NodeJS.Process & { windowsStore?: boolean }).windowsStore
}

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: () => Promise<unknown>) => state.handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [] },
}))
vi.mock('electron-updater', () => ({ autoUpdater: state.updater }))
import { initManualUpdater, registerUpdaterIpc } from '../electron/main/updater'

describe('manual application updates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    state.handlers.clear()
    state.listeners.clear()
    state.updater.on.mockImplementation((event, listener) => state.listeners.set(event, listener))
  })
  afterEach(() => {
    vi.useRealTimers()
    restoreProcessChannel()
  })

  it('stays idle after startup and never downloads or installs automatically', async () => {
    const send = vi.fn()
    initManualUpdater({ webContents: { send } } as unknown as BrowserWindow)
    registerUpdaterIpc()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(state.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(state.updater.downloadUpdate).not.toHaveBeenCalled()
    expect(state.updater.quitAndInstall).not.toHaveBeenCalled()
    expect(state.updater.autoDownload).toBe(false)
    expect(state.updater.autoInstallOnAppQuit).toBe(false)
    // Finding a version reports it without starting a download.
    state.listeners.get('update-available')?.({ version: '2.0.0' })
    expect(send).toHaveBeenCalledWith('updater:status', { status: 'available', version: '2.0.0' })
    expect(state.updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('keeps check, download and install as separate explicit actions', async () => {
    setWindowsStoreChannel(false)
    initManualUpdater({ webContents: { send: vi.fn() } } as unknown as BrowserWindow)
    registerUpdaterIpc()
    expect(await state.handlers.get('updater:channel')?.()).toBe('manual')
    await state.handlers.get('updater:check')?.()
    expect(state.updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(state.updater.downloadUpdate).not.toHaveBeenCalled()
    await state.handlers.get('updater:download')?.()
    expect(state.updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(state.updater.quitAndInstall).not.toHaveBeenCalled()
    await state.handlers.get('updater:install')?.()
    expect(state.updater.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('does not invoke the GitHub/NSIS updater from a Microsoft Store package', async () => {
    setWindowsStoreChannel(true)
    initManualUpdater({ webContents: { send: vi.fn() } } as unknown as BrowserWindow)
    registerUpdaterIpc()
    expect(await state.handlers.get('updater:channel')?.()).toBe('store')

    await state.handlers.get('updater:check')?.()
    await state.handlers.get('updater:download')?.()
    await state.handlers.get('updater:install')?.()

    expect(state.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(state.updater.downloadUpdate).not.toHaveBeenCalled()
    expect(state.updater.quitAndInstall).not.toHaveBeenCalled()
    expect(state.updater.on).not.toHaveBeenCalled()
  })
})
