import type { ModelDownloadResult } from '../../shared/modelDownload'

export class ModelDownloadHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`HTTP error ${statusCode}`)
    this.name = 'ModelDownloadHttpError'
  }
}

export function isUnavailableDownloadSource(error: unknown): boolean {
  return error instanceof ModelDownloadHttpError && [401, 403, 404].includes(error.statusCode)
}

/** Only typed transport status is actionable; never infer authorization from error text. */
export function modelDownloadFailure(error: unknown): ModelDownloadResult {
  if (error instanceof ModelDownloadHttpError) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return { success: false, failureReason: 'access_denied', error: 'Model source access denied' }
    }
    if (error.statusCode === 404) {
      return { success: false, failureReason: 'source_unavailable', error: 'Model source unavailable' }
    }
  }
  return { success: false, failureReason: 'other', error: 'Model download failed' }
}
