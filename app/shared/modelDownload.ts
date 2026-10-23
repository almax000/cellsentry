export type ModelDownloadFailureReason = 'not_configured' | 'access_denied' | 'source_unavailable' | 'other'

export interface ModelDownloadResult {
  success: boolean
  error?: string
  failureReason?: ModelDownloadFailureReason
}
