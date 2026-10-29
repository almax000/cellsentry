import type { AnalysisResult } from '../types'
import type { Issue } from '../types'

export function auditAiStatusKey(issue: Issue): string {
  if (issue.llmReviewRequired) return 'aiReviewRequired'
  return issue.llmDisputed ? 'aiDisputed' : issue.llmVerified === true ? 'aiVerified' : 'workspace.aiUnreviewed'
}

export function auditDraftIdentity(result: AnalysisResult | null): string {
  if (!result) return ''
  // Bind decisions to the complete rule evidence, excluding later AI opinions.
  const evidence = result.issues.map(issue => JSON.stringify([
    issue.sheetName, issue.cell, issue.ruleId, issue.formula, issue.severity,
    issue.message, issue.suggestion, issue.category, issue.confidence,
    issue.currentValue, issue.expectedValue, issue.correctFormula,
  ])).sort()
  return JSON.stringify([result.filePath, result.sourceFingerprint || result.scannedAt, evidence])
}
