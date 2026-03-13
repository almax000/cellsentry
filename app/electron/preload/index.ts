import { contextBridge, ipcRenderer, webUtils } from 'electron'

const IS_TEST_MODE = process.env.CELLSENTRY_TEST_MODE === '1'

const api: SidecarAPI = {
  getHealth: () => ipcRenderer.invoke('sidecar:health'),
  getModelStatus: () => ipcRenderer.invoke('sidecar:model-status'),
  analyzeFile: (filePath: string) => ipcRenderer.invoke('sidecar:analyze', filePath),
  getFileInfo: (filePath: string) => ipcRenderer.invoke('sidecar:file-info', filePath),
  onScanProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('sidecar:scan-progress', handler)
    return (): void => {
      ipcRenderer.removeListener('sidecar:scan-progress', handler)
    }
  },
  getFileCells: (filePath: string, sheet: string, range: string) =>
    ipcRenderer.invoke('sidecar:file-cells', filePath, sheet, range),
  generateReport: (data: { issues: unknown[]; fileName: string }) =>
    ipcRenderer.invoke('sidecar:report-generate', data),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFilesDialog: () => ipcRenderer.invoke('dialog:open-files'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  scanFolder: (folderPath: string) => ipcRenderer.invoke('sidecar:scan-folder', folderPath),
  checkModelExists: () => ipcRenderer.invoke('sidecar:model-check'),
  downloadModel: () => ipcRenderer.invoke('sidecar:model-download'),
  onModelDownloadProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ModelDownloadProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('sidecar:model-download-progress', handler)
    return (): void => {
      ipcRenderer.removeListener('sidecar:model-download-progress', handler)
    }
  },
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => {
      callback(status)
    }
    ipcRenderer.on('updater:status', handler)
    return (): void => {
      ipcRenderer.removeListener('updater:status', handler)
    }
  },
  onTestTriggerAnalysis: IS_TEST_MODE
    ? (callback: (filePath: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, filePath: string): void => {
          callback(filePath)
        }
        ipcRenderer.on('test:trigger-analysis', handler)
        return (): void => {
          ipcRenderer.removeListener('test:trigger-analysis', handler)
        }
      }
    : undefined,
  onTestTriggerPiiScan: IS_TEST_MODE
    ? (callback: (filePath: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, filePath: string): void => {
          callback(filePath)
        }
        ipcRenderer.on('test:trigger-pii-scan', handler)
        return (): void => {
          ipcRenderer.removeListener('test:trigger-pii-scan', handler)
        }
      }
    : undefined,
  onTestTriggerExtractionScan: IS_TEST_MODE
    ? (callback: (filePath: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, filePath: string): void => {
          callback(filePath)
        }
        ipcRenderer.on('test:trigger-extraction-scan', handler)
        return (): void => {
          ipcRenderer.removeListener('test:trigger-extraction-scan', handler)
        }
      }
    : undefined,
  onTestResetState: IS_TEST_MODE
    ? (callback: () => void) => {
        const handler = (): void => { callback() }
        ipcRenderer.on('test:reset-state', handler)
        return (): void => {
          ipcRenderer.removeListener('test:reset-state', handler)
        }
      }
    : undefined,
  openFilePath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  getFilePathFromDrop: (file: File) => webUtils.getPathForFile(file),
  platform: process.platform,
  zoom: {
    get: (): Promise<number> => ipcRenderer.invoke('zoom:get'),
    set: (level: number): Promise<void> => ipcRenderer.invoke('zoom:set', level)
  },
  // LLM
  getLlmStatus: () => ipcRenderer.invoke('llm:status'),
  startLlm: () => ipcRenderer.invoke('llm:start'),
  onZoomChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: number): void => {
      callback(delta)
    }
    ipcRenderer.on('zoom:change', handler)
    return (): void => {
      ipcRenderer.removeListener('zoom:change', handler)
    }
  },
  // PII
  analyzePii: (filePath: string) => ipcRenderer.invoke('pii:analyze', filePath),
  redactPii: (filePath: string, outputPath: string) => ipcRenderer.invoke('pii:redact', filePath, outputPath),
  // Extraction
  analyzeExtraction: (filePath: string) => ipcRenderer.invoke('extraction:analyze', filePath),
  exportExtraction: (filePath: string, format: string, outputPath: string) =>
    ipcRenderer.invoke('extraction:export', filePath, format, outputPath),
}

contextBridge.exposeInMainWorld('api', api)

if (IS_TEST_MODE) {
  const testApi: TestAPI = {
    getRouterPath: () => {
      return ipcRenderer.invoke('test:get-router-path')
    },
    getScanState: () => {
      return ipcRenderer.invoke('test:get-scan-state')
    },
    triggerFileAnalysis: (filePath: string) => {
      return ipcRenderer.invoke('test:trigger-analysis', filePath)
    },
    triggerPiiScan: (filePath: string) => {
      ipcRenderer.send('test:trigger-pii-scan', filePath)
    },
    triggerExtractionScan: (filePath: string) => {
      ipcRenderer.send('test:trigger-extraction-scan', filePath)
    },
    resetState: () => {
      ipcRenderer.send('test:reset-state')
    }
  }
  contextBridge.exposeInMainWorld('__TEST_API__', testApi)
}
