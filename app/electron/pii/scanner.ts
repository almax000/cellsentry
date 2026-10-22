/**
 * PII scanner — reads an Excel file and returns all PII findings.
 *
 * Two-pass approach:
 * 1. Regex pass: fast deterministic patterns
 * 2. LLM pass (optional): catches names, addresses, and other soft PII
 *    that regex cannot reliably detect
 */

import { readWorkbook } from '../engine/excelReader'
import type { SheetContext } from '../engine/types'
import { PII_PATTERNS } from './patterns'
import { PiiType } from './types'
import type { PiiFinding, PiiScanResult } from './types'
import { analyzeWithLlmPii, isLocalAiReadyFor } from '../llm/lifecycle'
import type { LlmCellContext } from '../llm/types'
import { maskValue, maskPiiText } from './masking'

const LLM_CANDIDATE_LIMIT = 100

/**
 * Scan an Excel file for PII.
 *
 * Iterates every non-empty cell across all sheets, testing cell text against
 * each PII pattern. When a validator is present the confidence is raised to
 * 0.95; regex-only matches get 0.8.
 *
 * If the installed model supports PII, unflagged text cells are sent for secondary
 * screening to catch soft PII (names, addresses) that regex cannot detect.
 */
export async function scanForPiiFromSheets(sheets: SheetContext[]): Promise<PiiScanResult> {
  const start = Date.now()

  try {
    const findings: PiiFinding[] = []
    let aiWarning: string | undefined
    const regexFlaggedCells = new Set<string>() // "Sheet!A1" keys

    // Pass 1: regex patterns
    for (const sheet of sheets) {
      for (const cell of Object.values(sheet.cells)) {
        if (cell.dataType === 'empty' || cell.value == null) continue

        const text = String(cell.value)
        if (text.length < 3) continue

        const foundTypes = new Set<string>()
        for (const pattern of PII_PATTERNS) {
          if (foundTypes.has(pattern.type)) continue
          const flags = pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`
          const matches = text.matchAll(new RegExp(pattern.regex.source, flags))
          const validMatch = Array.from(matches).some((match) => !pattern.validator || pattern.validator(match[0]))
          if (!validMatch) continue

          findings.push({
            sheet_name: sheet.name,
            cell: cell.address,
            pii_type: pattern.type,
            original_value: text,
            masked_value: maskPiiText(text, pattern.type),
            confidence: pattern.validator ? 0.95 : 0.8,
            pattern: pattern.label,
          })
          regexFlaggedCells.add(`${sheet.name}!${cell.address}`)
          foundTypes.add(pattern.type)
        }
      }
    }

    // Pass 2: LLM secondary screening, only when the installed model declares
    // PII support. Otherwise the regex result is final and carries no AI warning.
    const candidates: LlmCellContext[] = []
    const screenWithAi = isLocalAiReadyFor('pii')

    for (const sheet of screenWithAi ? sheets : []) {
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
      try {
        const llmFindings = await analyzeWithLlmPii(candidates)
        const candidateAddresses = new Set(candidates.map((candidate) => candidate.address))
        const validPiiTypes = new Set(Object.values(PiiType))
        for (const f of llmFindings) {
          if (!candidateAddresses.has(f.cellAddress) || !validPiiTypes.has(f.piiType as PiiType)) continue
          if (!Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1) continue
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
      } catch (error) {
        // Regex findings remain useful even when the optional model is unavailable.
        aiWarning = error instanceof Error ? error.message : String(error)
      }
    }

    return {
      success: true,
      findings,
      duration: Date.now() - start,
      scannedAt: new Date().toISOString(),
      ...(aiWarning ? { aiWarning } : {}),
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

export async function scanForPii(filePath: string): Promise<PiiScanResult> {
  const { sheets } = await readWorkbook(filePath)
  return scanForPiiFromSheets(sheets)
}
