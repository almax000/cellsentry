import { contextBridge, ipcRenderer, webUtils } from 'electron'

const IS_TEST_MODE = process.env.CELLSENTRY_TEST_MODE === '1'

const api: SidecarAPI = {
  getHealth: () => ipcRenderer.invoke('sidecar:health'),
  getModelStatus: () => ipcRenderer.invoke('sidecar:model-status'),

  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFilesDialog: () => ipcRenderer.invoke('dialog:open-files'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),

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
  notifyModelReady: () => ipcRenderer.send('model:download-complete'),

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

  openFilePath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  getFilePathFromDrop: (file: File) => webUtils.getPathForFile(file),
  platform: process.platform,

  zoom: {
    get: () => ipcRenderer.invoke('zoom:get'),
    set: (level: number) => ipcRenderer.invoke('zoom:set', level),
  },
  onZoomChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: number): void => {
      callback(delta)
    }
    ipcRenderer.on('zoom:change', handler)
    return (): void => {
      ipcRenderer.removeListener('zoom:change', handler)
    }
  },

  getLlmStatus: () => ipcRenderer.invoke('llm:status'),
  startLlm: () => ipcRenderer.invoke('llm:start'),
}

contextBridge.exposeInMainWorld('api', api)

if (IS_TEST_MODE) {
  const testApi: TestAPI = {
    getRouterPath: () => {
      return ipcRenderer.invoke('test:get-router-path')
    },
    resetState: () => {
      ipcRenderer.send('test:reset-state')
    },
  }
  contextBridge.exposeInMainWorld('__TEST_API__', testApi)
}
