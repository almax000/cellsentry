import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  registerAnalysis: vi.fn(),
  registerLocale: vi.fn(),
  registerRedact: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), getLocale: vi.fn() },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => state.handlers.set(channel, handler) },
  dialog: {},
  shell: {},
}))
vi.mock('../electron/engine/excelReader', () => ({ getFileInfo: vi.fn(), readFileCells: vi.fn() }))
vi.mock('../electron/report/generator', () => ({ generateReport: vi.fn() }))
vi.mock('../electron/model/downloader', () => ({ ModelDownloader: class {}, DEFAULT_MODEL: {} }))
vi.mock('../electron/model/importer', () => ({ importModelFile: vi.fn() }))
vi.mock('../electron/model/bundled', () => ({
  getBundledModelSetupStatus: vi.fn(), isBundledModelPreparing: vi.fn(), markBundledModelReady: vi.fn(),
  modelSetupError: vi.fn(), setBundledModelError: vi.fn(),
}))
vi.mock('../electron/model/downloadFailure', () => ({ ModelDownloadNotConfiguredError: class {}, modelDownloadFailure: vi.fn() }))
vi.mock('../electron/model/paths', () => ({ getModelsDir: vi.fn() }))
vi.mock('../electron/llm/lifecycle', () => ({ getLlmStatus: vi.fn(), analyzeWithLlm: vi.fn(), startLlm: vi.fn(), cancelLlmAnalysis: vi.fn() }))
vi.mock('../electron/main/analysisHandlers', () => ({
  hasActiveAnalysis: vi.fn(), registerAnalysisHandlers: state.registerAnalysis, withModelMaintenance: vi.fn(),
}))
vi.mock('../electron/main/localeIpc', () => ({ registerLocaleIpc: state.registerLocale }))
vi.mock('../electron/redact/ipc', () => ({ registerRedactIpc: state.registerRedact }))
vi.mock('../electron/main/exportHandlers', () => ({ exportAudit: vi.fn(), redactPii: vi.fn() }))

import { registerIpcHandlers } from '../electron/main/ipc'

describe('spreadsheet-only IPC product surface', () => {
  beforeEach(() => {
    state.handlers.clear()
    vi.clearAllMocks()
  })

  it('registers audit and workbook-redaction exports, not document-redaction or extraction endpoints', () => {
    registerIpcHandlers()

    expect(state.handlers.has('audit:export')).toBe(true)
    expect(state.handlers.has('pii:redact')).toBe(true)
    expect(state.handlers.has('extraction:export')).toBe(false)
    expect(state.registerRedact).not.toHaveBeenCalled()
  })
})
