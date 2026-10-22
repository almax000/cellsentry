import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Issue } from '../types'
import { CopyIcon } from './icons'
import { cellLabel, excelReference } from '../utils/cellLabel'
import './IssueCard.css'

interface IssueCardProps {
  issue: Issue
  isSelected: boolean
  isExpanded: boolean
  onClick: () => void
  /** True only when the formula assistant actually reviewed this scan. */
  showAiReview?: boolean
  'data-testid'?: string
}

export default function IssueCard({
  issue,
  isSelected,
  isExpanded,
  onClick,
  showAiReview = false,
  'data-testid': testId,
}: IssueCardProps): JSX.Element {
  const { t, i18n } = useTranslation('results')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const severityClass = issue.severity === 'error' ? 'critical' : issue.severity
  const needsReview = showAiReview && issue.llmReviewRequired === true
  const hasAiVerdict = showAiReview && !needsReview && issue.llmVerified !== undefined
  const reference = excelReference(issue.sheetName, issue.cell)
  // Rule suggestions also feed the frozen model's evidence, so plain-language rewrites
  // are applied here at display time instead of in the engine.
  const overrideKey = `suggestionOverrides.${issue.ruleId}`
  const suggestion = i18n.exists(overrideKey, { ns: 'results' }) ? t(overrideKey) : issue.suggestion

  return (
    <div
      className={`issue-card ${severityClass} ${isSelected ? 'selected' : ''}`}
      data-testid={testId || 'issue-card'}
      data-rule-id={issue.ruleId}
      data-sheet-name={issue.sheetName}
      data-cell-address={issue.cell}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <div className="issue-card-header">
        <span className={`issue-severity-dot ${severityClass}`} />
        <span className="issue-cell">{cellLabel(issue.cell, i18n.language)}</span>
      </div>

      <div className="issue-message">{issue.message}</div>

      {(issue.layer === 'ai' || hasAiVerdict || needsReview) && (
        <div className="issue-meta">
          {issue.layer === 'ai' && <span className="issue-layer ai">✦ {t('aiLabel')}</span>}
          {needsReview && (
            <span className="issue-ai-badge" title={issue.llmReasoning || ''}>
              {t('aiReviewRequired')}
            </span>
          )}
          {hasAiVerdict && (
            <span
              className={`issue-ai-badge ${issue.llmVerified ? 'verified' : 'disputed'}`}
              title={issue.llmReasoning || ''}
            >
              {issue.llmVerified ? `✓ ${t('aiVerified')}` : t('aiDisputed')}
            </span>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="issue-detail">
          <div className="issue-detail-row">
            <span className="issue-detail-label">{t('source')}</span>
            <span className="issue-detail-place">{cellLabel(issue.cell, i18n.language, issue.sheetName)}</span>
          </div>
          {suggestion && (
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('suggest')}</span>
              <span className="issue-detail-suggested">{suggestion}</span>
            </div>
          )}
          {showAiReview && issue.llmReasoning && (
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('aiReasoning')}</span>
              <span className="issue-detail-reasoning">{issue.llmReasoning}</span>
            </div>
          )}
          {hasAiVerdict && <p className="issue-review-note">{t('reviewNote')}</p>}
          {/* Clicks inside must not toggle the whole card closed. */}
          <details className="issue-tech" onClick={(event) => event.stopPropagation()}>
            <summary>{t('technicalDetails')}</summary>
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('ruleId')}</span>
              <span className="issue-detail-formula">{issue.ruleId}</span>
            </div>
            <div className="issue-detail-row">
              <span className="issue-detail-label">{t('cellReference')}</span>
              <span className="issue-detail-formula">{reference}</span>
            </div>
            {issue.formula && (
              <div className="issue-detail-row">
                <span className="issue-detail-label">{t('formula')}</span>
                <span className="issue-detail-formula">{issue.formula}</span>
              </div>
            )}
          </details>
          <div className="issue-detail-actions">
            <button className="btn btn-ghost" onClick={async (event) => {
              event.stopPropagation()
              try {
                await navigator.clipboard.writeText(reference)
                setCopyStatus('copied')
              } catch {
                setCopyStatus('failed')
              }
            }}>
              <CopyIcon size={12} /> {t('copyCell')}
            </button>
            <span role="status">{copyStatus === 'copied' ? t('copied') : copyStatus === 'failed' ? t('copyFailed') : ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
