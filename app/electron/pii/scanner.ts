/**
 * PII scanner — reads an Excel file and returns all PII findings.
 *
 * Two-pass approach:
 * 1. Regex pass: fast deterministic patterns
 * 2. LLM pass (optional): catches names, addresses, and other soft PII
 *    that regex cannot reliably detect
 */

import { readWorkbook } from '../engine/excelReader'
import { PII_PATTERNS } from './patterns'
import { PiiType } from './types'
import type { PiiFinding, PiiScanResult } from './types'
import { analyzeWithLlmPii } from '../llm/lifecycle'
import type { LlmCellContext } from '../llm/types'

const LLM_CANDIDATE_LIMIT = 100

/**
 * Mask a matched value, preserving a few characters at each end for
 * human readability while hiding the sensitive middle portion.
 */
function maskValue(value: string, piiType: string): string {
  switch (piiType) {
    case PiiType.EMAIL: {
      const atIdx = value.indexOf('@')
      if (atIdx <= 1) return '***' + value.substring(atIdx)
      return value[0] + '***' + value.substring(atIdx)
    }
    case PiiType.PHONE: {
      const digits = value.replace(/\D/g, '')
      if (digits.length <= 4) return '****'
      const prefix = digits.substring(0, 3)
      const suffix = digits.substring(digits.length - 4)
      return prefix + '****' + suffix
    }
    case PiiType.ID_NUMBER: {
      const cleaned = value.replace(/\s/g, '')
      if (cleaned.length <= 6) return '******'
      return cleaned.substring(0, 4) + '**********' + cleaned.substring(cleaned.length - 4)
    }
    case PiiType.CREDIT_CARD:
    case PiiType.BANK_CARD: {
      const d = value.replace(/\D/g, '')
      if (d.length <= 4) return '****'
      return '****-****-****-' + d.substring(d.length - 4)
    }
    case PiiType.SSN: {
      if (value.includes('-')) return '***-**-' + value.substring(value.length - 4)
      return '*****' + value.substring(value.length - 4)
    }
    default: {
      if (value.length <= 4) return '****'
      return value.substring(0, 2) + '***' + value.substring(value.length - 2)
    }
  }
}

/**
 * Scan an Excel file for PII.
 *
 * Iterates every non-empty cell across all sheets, testing cell text against
 * each PII pattern. When a validator is present the confidence is raised to
 * 0.95; regex-only matches get 0.8.
 *
 * If the LLM is available, unflagged text cells are sent for secondary
 * screening to catch soft PII (names, addresses) that regex cannot detect.
 */
export async function scanForPii(filePath: string): Promise<PiiScanResult> {
  const start = Date.now()

  try {
    const { sheets } = await readWorkbook(filePath)
    const findings: PiiFinding[] = []
    const regexFlaggedCells = new Set<string>() // "Sheet!A1" keys

    // Pass 1: regex patterns
    for (const sheet of sheets) {
      for (const cell of Object.values(sheet.cells)) {
        if (cell.dataType === 'empty' || cell.value == null) continue

        const text = String(cell.value)
        if (text.length < 3) continue

        for (const pattern of PII_PATTERNS) {
          const match = text.match(pattern.regex)
          if (!match) continue
          if (pattern.validator && !pattern.validator(match[0])) continue

          findings.push({
            sheet_name: sheet.name,
            cell: cell.address,
            pii_type: pattern.type,
            original_value: text,
            masked_value: maskValue(match[0], pattern.type),
            confidence: pattern.validator ? 0.95 : 0.8,
            pattern: pattern.label,
          })
          regexFlaggedCells.add(`${sheet.name}!${cell.address}`)
          break // one match per cell
        }
      }
    }

    // Pass 2: LLM secondary screening
    const candidates: LlmCellContext[] = []

    for (const sheet of sheets) {
      for (const cell of Object.values(sheet.cells)) {
        if (candidates.length >= LLM_CANDIDATE_LIMIT) break
        if (cell.dataType === 'empty' || cell.value == null) continue
        const text = String(cell.value)
        if (regexFlaggedCells.has(`${sheet.name}!${cell.address}`)) continue
        if (cell.formula) continue
        if (/^\d+\.?\d*$/.test(text)) continue
        if (text.length <= 10) continue

        candidates.push({
          address: `${sheet.name}!${cell.address}`,
          value: text,
        })
      }
      if (candidates.length >= LLM_CANDIDATE_LIMIT) break
    }

    if (candidates.length > 0) {
      const llmFindings = await analyzeWithLlmPii(candidates)
      for (const f of llmFindings) {
        const alreadyFound = findings.some(
          (existing) => `${existing.sheet_name}!${existing.cell}` === f.cellAddress
        )
        if (alreadyFound) continue

        const bangIdx = f.cellAddress.indexOf('!')
        const sheetName = bangIdx > 0 ? f.cellAddress.substring(0, bangIdx) : 'Sheet1'
        const cellAddr = bangIdx > 0 ? f.cellAddress.substring(bangIdx + 1) : f.cellAddress

        const origCell = candidates.find((c) => c.address === f.cellAddress)
        const origValue = origCell?.value || ''

        findings.push({
          sheet_name: sheetName,
          cell: cellAddr,
          pii_type: f.piiType,
          original_value: origValue,
          masked_value: maskValue(origValue, f.piiType),
          confidence: f.confidence,
          pattern: 'ai-detected',
        })
      }
    }

    return {
      success: true,
      findings,
      duration: Date.now() - start,
      scannedAt: new Date().toISOString(),
    }
  } catch (e) {
    return {
      success: false,
      findings: [],
      duration: Date.now() - start,
      scannedAt: new Date().toISOString(),
      error: String(e),
    }
  }
}
