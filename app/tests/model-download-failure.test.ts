import { describe, expect, it } from 'vitest'
import { ModelDownloadHttpError, modelDownloadFailure } from '../electron/model/downloadFailure'

describe('public model download failures', () => {
  it.each([401, 403])('classifies HTTP %i as access denied', (status) => {
    expect(modelDownloadFailure(new ModelDownloadHttpError(status))).toEqual({
      success: false, failureReason: 'access_denied', error: 'Model source access denied',
    })
  })

  it('does not diagnose a 404 as an authorization failure', () => {
    expect(modelDownloadFailure(new ModelDownloadHttpError(404))).toEqual({
      success: false, failureReason: 'source_unavailable', error: 'Model source unavailable',
    })
  })

  it.each([
    new ModelDownloadHttpError(503),
    new Error('Request failed at https://private.example/model?credential=fixture'),
    new Error('HTTP error 403'),
    { statusCode: 403 },
  ])('does not leak diagnostics or infer status from untyped errors', (error) => {
    expect(modelDownloadFailure(error)).toEqual({
      success: false, failureReason: 'other', error: 'Model download failed',
    })
  })
})
