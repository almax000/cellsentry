// IPC wrapper for sidecar communication
// All calls go through window.api (exposed by preload via contextBridge)

export async function getHealth(): Promise<{ status: string; version: string }> {
  return window.api.getHealth()
}

export async function getModelStatus(): Promise<{
  loaded: boolean
  name: string
  size: string
}> {
  return window.api.getModelStatus()
}

export async function analyzeFile(filePath: string): Promise<AnalysisResult> {
  return window.api.analyzeFile(filePath)
}

export async function getFileInfo(filePath: string): Promise<FileInfo> {
  return window.api.getFileInfo(filePath)
}

export function onScanProgress(callback: (progress: ScanProgress) => void): () => void {
  return window.api.onScanProgress(callback)
}

export async function openFileDialog(): Promise<string | null> {
  return window.api.openFileDialog()
}
