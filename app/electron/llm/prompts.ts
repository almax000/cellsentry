/**
 * Prompt templates for the three LLM analysis modes.
 *
 * Each builder returns a single string that the Python server passes to the model.
 * Output format is always JSON so results can be parsed deterministically.
 */

import type { LlmIssueInput, LlmCellContext } from './types'

// ---------------------------------------------------------------------------
// Audit mode — validate rule-engine findings
// ---------------------------------------------------------------------------

export function buildAuditPrompt(issues: LlmIssueInput[]): string {
  const issueList = issues
    .map((issue, i) => {
      let entry = `${i + 1}. [${issue.ruleId}] Cell ${issue.sheetName}!${issue.cellAddress}\n`
      entry += `   Formula: ${issue.formula}\n`
      entry += `   Finding: ${issue.message}\n`
      entry += `   Rule confidence: ${issue.confidence}`
      if (issue.context) {
        entry += `\n   Context: ${issue.context}`
      }
      return entry
    })
    .join('\n')

  return [
    'You are a spreadsheet formula auditor. An automated rule engine found the following potential issues.',
    'For each issue, determine whether it is a real error or a false positive.',
    '',
    'Issues:',
    issueList,
    '',
    'Respond with a JSON array. Each element must have exactly these fields:',
    '- cellAddress (string): the cell reference',
    '- ruleId (string): the rule that flagged it',
    '- isValid (boolean): true if the rule-engine finding is a real error, false if it is a false positive',
    '- adjustedConfidence (number): your confidence from 0 to 1',
    '- reasoning (string): one sentence explaining your judgment',
    '',
    'Output ONLY the JSON array, no markdown fences or extra text.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// PII mode — detect personally identifiable information
// ---------------------------------------------------------------------------

export function buildPiiPrompt(cells: LlmCellContext[]): string {
  const cellList = cells
    .map((c) => {
      let entry = `- ${c.address}: ${c.value}`
      if (c.formula) entry += ` (formula: ${c.formula})`
      return entry
    })
    .join('\n')

  return [
    'You are a PII detection specialist. Review the following cell values from a spreadsheet.',
    'Identify any personally identifiable information that simple regex patterns might miss.',
    'Consider context: "John" alone is not PII, but a full name with an ID number is.',
    '',
    'Cells:',
    cellList,
    '',
    'Respond with a JSON array. Each element must have:',
    '- cellAddress (string): the cell reference',
    '- piiType (string): one of "name", "email", "phone", "ssn", "id_number", "credit_card", "address", "passport", "bank_card", "iban", "other"',
    '- confidence (number): 0 to 1',
    '- reasoning (string): brief explanation',
    '',
    'If no PII is found, return an empty array [].',
    'Output ONLY the JSON array, no markdown fences or extra text.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Extraction mode — identify document type and extract key-value fields
// ---------------------------------------------------------------------------

export function buildExtractionPrompt(cells: LlmCellContext[]): string {
  const cellList = cells
    .map((c) => {
      let entry = `- ${c.address}: ${c.value}`
      if (c.formula) entry += ` (formula: ${c.formula})`
      return entry
    })
    .join('\n')

  return [
    'You are a document data extractor. Given these cell values from a spreadsheet,',
    'identify the document type and extract key-value fields.',
    '',
    'Cells:',
    cellList,
    '',
    'Respond with a JSON object containing:',
    '- documentType (string): one of "invoice", "receipt", "expense_report", "purchase_order", "payroll", "unknown"',
    '- fields (array): each element has { key, label, value, cellAddress, confidence }',
    '  - key: snake_case identifier (e.g. "invoice_number", "total_amount")',
    '  - label: human-readable label',
    '  - value: extracted value as string',
    '  - cellAddress: source cell reference',
    '  - confidence: 0 to 1',
    '',
    'Output ONLY the JSON object, no markdown fences or extra text.',
  ].join('\n')
}
