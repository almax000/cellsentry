export type ModelDownloadFailureReason = 'access_denied' | 'source_unavailable' | 'other'

export interface ModelDownloadResult {
  success: boolean
  error?: string
  failureReason?: ModelDownloadFailureReason
}
