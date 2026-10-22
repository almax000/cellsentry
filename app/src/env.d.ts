/// <reference types="vite/client" />
export {}

declare global {
  type SidecarAPI = import('../shared/api').SidecarAPI
  type UpdateStatus = import('../shared/api').UpdateStatus
  type AnalysisResult = import('../shared/api').AnalysisResult
  type FileInfo = import('../shared/api').FileInfo
  type FileCellsResult = import('../shared/api').FileCellsResult
  type ScanProgress = import('../shared/api').ScanProgress
  type TestAPI = import('../shared/api').TestAPI
  type ModelDownloadProgress = import('../shared/api').ModelDownloadProgress
  type ModelStatus = import('../shared/api').ModelStatus
  type EngineDoneEvent = import('../shared/api').EngineDoneEvent
  interface Window { api: SidecarAPI; __TEST_API__?: TestAPI }
}
