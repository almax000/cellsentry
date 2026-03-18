import { useTranslation } from 'react-i18next'
import type { Issue } from '../types'
import { formatConfidence } from '../utils/format'
import { CopyIcon } from './icons'
import './IssueCard.css'

interface IssueCardProps {
  issue: Issue
  isSelected: boolean
  isExpanded: boolean
  onClick: () => void
  'data-testid'?: string
}

export default function IssueCard({
  issue,
  isSelected,
  isExpanded,
  onClick,
  'data-testid': testId,
}: IssueCardProps): JSX.Element {
  const { t } = useTranslation('results')
  const severityClass = issue.severity === 'error' ? 'critical' : issue.severity

  return (
    <div
      className={`issue-card ${severityClass} ${isSelected ? 'selected' : ''}`}
      data-testid={testId || 'issue-card'}
      onClick={onClick}
    >
      <div className="issue-card-header">
        <span className={`issue-severity-dot ${severityClass}`} />
        <span className="issue-cell">{issue.cell}</span>
        <span className="issue-rule">{issue.ruleId}</span>
      </div>

      <div className="issue-message">{issue.message}</div>

      <div className="issue-meta">
        <span className="issue-confidence">
          <span className="confidence-bar">
            <span
              className="confidence-fill"
              style={{
                width: `${(issue.confidence || 0) * 100}%`,
                background:
                  issue.confidence > 0.85
                    ? 'var(--brand)'
                    : issue.confidence > 0.7
                      ? 'var(--warning)'
                      : 'var(--text-muted)',
              }}
            />
          </span>
          {formatConfidence(issue.confidence)}
        </span>
        <span className={`issue-layer ${issue.layer === 'ai' ? 'ai' : ''}`}>
          {issue.layer === 'ai' ? `✦ ${t('aiLabel')}` : `⚙ ${t('ruleLabel')}`}
        </span>
        {issue.llmVerified !== undefined && (
          <span
            className={`issue-ai-badge ${issue.llmVerified ? 'verified' : 'disputed'}`}
            title={issue.llmReasoning || ''}
          >
            {issue.llmVerified ? `✓ ${t('aiVerified')}` : `✗ ${t('aiDisputed')}`}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="issue-detail">
          {issue.formula && (
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('formula')}</span>
              <span className="issue-detail-formula">{issue.formula}</span>
            </div>
          )}
          {issue.suggestion && (
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('suggest')}</span>
              <span className="issue-detail-suggested">{issue.suggestion}</span>
            </div>
          )}
          {issue.llmReasoning && (
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('aiReasoning')}</span>
              <span className="issue-detail-reasoning">{issue.llmReasoning}</span>
            </div>
          )}
          <div className="issue-detail-actions">
            <button className="btn btn-ghost" onClick={(e) => e.stopPropagation()}>
              <CopyIcon size={12} /> {t('copyCell')}
            </button>
            <button className="btn btn-ghost" onClick={(e) => e.stopPropagation()}>
              {t('ignore')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
