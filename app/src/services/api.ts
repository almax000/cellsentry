// Renderer-side IPC wrapper.
// All v1.x calls (analyzeFile / getFileInfo / scan-progress) removed.
// v2 medical-pipeline calls will be added in W1 Step 1.2 (medical/ scaffold).

export async function getHealth(): Promise<{ status: string; engine: string; version: string }> {
  return window.api.getHealth()
}

export async function getModelStatus(): Promise<{ loaded: boolean; backend: string }> {
  return window.api.getModelStatus()
}

export async function openFileDialog(): Promise<string | null> {
  return window.api.openFileDialog()
}
