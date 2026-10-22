import { useTranslation } from 'react-i18next'
import type { AuditReviewProgress, AuditReviewSummary } from '../../shared/auditReview'

// Only rendered when the formula assistant actually ran: the main process sends
// review progress and `auditReview` exclusively for scans where local AI took part.

export function AuditReviewProgressNotice({ review }: { review: AuditReviewProgress }): JSX.Element {
  const { t } = useTranslation('scanning')
  return <div className="audit-review-progress" role="status" data-testid="audit-review-progress">
    <div>{t('aiReviewProgress', { attempted: review.attempted, selected: review.selected })}</div>
    <div className="audit-review-detail">{t('aiReviewScope', { selected: review.selected, total: review.total })}</div>
  </div>
}

export function AuditReviewSummaryNotice({ review }: { review: AuditReviewSummary }): JSX.Element {
  const { t, i18n } = useTranslation('scanning')
  const remaining = review.total - review.reviewed
  // Chinese sentences end in "。" and need no space between them.
  const gap = i18n.language?.startsWith('zh') ? '' : ' '
  return <div role="status" className="analysis-warning audit-review-summary" data-testid="audit-review-summary">
    <span>{t('aiReviewSummary', { reviewed: review.reviewed, total: review.total })}</span>
    {remaining > 0 && <span>{gap}{t('aiReviewRemaining', { count: remaining })}</span>}
    {review.failed > 0 && <span>{gap}{t('aiReviewFailed', { count: review.failed })}</span>}
    {review.stopReason === 'candidate-limit' && <span>{gap}{t('aiReviewCountLimit')}</span>}
    {review.stopReason === 'time-budget' && <span>{gap}{t('aiReviewTimeLimit')}</span>}
    {review.stopReason === 'model-unavailable' && <span>{gap}{t('aiReviewUnavailable')}</span>}
    <span>{gap}{t('aiReviewPreserved')}</span>
  </div>
}
