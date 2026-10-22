import { describe, expect, it } from 'vitest'
import { readAuditReviewProgress, readAuditReviewSummary } from '../shared/auditReviewValidation'

const summary = { total: 200, selected: 20, attempted: 20, reviewed: 18, failed: 2, skipped: 180, stopReason: 'candidate-limit' }

describe('AI review presentation counts', () => {
  it('keeps whole-workbook denominators including failures and unattempted findings', () => {
    expect(readAuditReviewSummary(summary)).toEqual(summary)
    expect(summary.total - summary.reviewed).toBe(182)
  })
  it('rejects inconsistent, nonfinite, negative or cancelled completion claims', () => {
    for (const changed of [
      { skipped: 0 }, { failed: 0 }, { selected: 201 }, { reviewed: NaN }, { attempted: -1 },
      { total: Infinity }, { stopReason: 'all-safe' }, { stopReason: 'cancelled' },
    ]) expect(readAuditReviewSummary({ ...summary, ...changed })).toBeUndefined()
  })
  it('accepts initial progress without pretending it is a completed review', () => {
    const initial = { ...summary, attempted: 0, reviewed: 0, failed: 0, skipped: 200, stopReason: undefined }
    expect(readAuditReviewProgress(initial)).toEqual(initial)
    expect(readAuditReviewSummary(initial)).toBeUndefined()
  })
})
