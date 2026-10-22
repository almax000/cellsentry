import type { RendererIssue } from '../engine/ruleEngine'
import type { LlmIssueInput } from '../llm/types'

export function mapToLlmInput(issues: RendererIssue[]): LlmIssueInput[] {
  return issues.map((issue) => ({
    ruleId: issue.ruleId,
    cellAddress: issue.cell,
    sheetName: issue.sheet,
    formula: issue.formula || '',
    message: issue.message,
    confidence: issue.confidence,
    context: issue.context,
  }))
}

export function orderAuditIssuesBySeverity(issues: RendererIssue[]): RendererIssue[] {
  const rank = { error: 0, warning: 1, info: 2 }
  return issues.map((issue, index) => ({ issue, index }))
    .sort((a, b) => (rank[a.issue.severity] ?? 3) - (rank[b.issue.severity] ?? 3) || a.index - b.index)
    .map(entry => entry.issue)
}
