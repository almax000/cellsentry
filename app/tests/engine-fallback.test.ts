import { beforeEach, describe, expect, it, vi } from 'vitest'

const ai = vi.hoisted(() => ({
  ready: vi.fn(),
  pii: vi.fn(),
  extraction: vi.fn(),
}))
vi.mock('../electron/llm/lifecycle', () => ({
  isLocalAiReadyFor: ai.ready,
  analyzeWithLlmPii: ai.pii,
  analyzeWithLlmExtraction: ai.extraction,
}))

import { scanForPiiFromSheets } from '../electron/pii/scanner'
import { extractDocumentFromSheets } from '../electron/extraction/extractor'
import type { SheetContext } from '../electron/engine/types'

function cell(address: string, row: number, column: number, value: string) {
  return {
    address,
    row,
    column,
    value,
    formula: null,
    dataType: 'text',
    numberFormat: null,
    isMerged: false,
    lenVisible: value.length,
    lenActual: value.length,
    hasHiddenChars: false,
  }
}

const piiSheets = (): SheetContext[] => [{
  name: 'Sheet1', maxRow: 2, maxColumn: 1,
  cells: {
    A1: cell('A1', 1, 1, 'alice@example.com'),
    A2: cell('A2', 2, 1, 'A person with a sufficiently long free-form address'),
  },
  mergedRanges: [], headers: { 1: 'contact' }, rowLabels: { 1: 'contact', 2: 'note' }, reportType: null,
}]

const tableSheets = (): SheetContext[] => [{
  name: 'Sheet1', maxRow: 3, maxColumn: 2,
  cells: {
    A1: cell('A1', 1, 1, 'Item'), B1: cell('B1', 1, 2, 'Quantity'),
    A2: cell('A2', 2, 1, 'Paper'), B2: cell('B2', 2, 2, '2'),
  },
  mergedRanges: [], headers: { 1: 'Item', 2: 'Quantity' }, rowLabels: { 1: 'Item', 2: 'Paper' }, reportType: null,
}]

beforeEach(() => {
  vi.clearAllMocks()
  // Default: an installed model that declares the task, then fails at inference.
  ai.ready.mockReturnValue(true)
  ai.pii.mockRejectedValue(new Error('local model unavailable'))
  ai.extraction.mockRejectedValue(new Error('local model unavailable'))
})

describe('optional AI failures', () => {
  it('keeps deterministic PII findings when secondary screening rejects', async () => {
    const result = await scanForPiiFromSheets(piiSheets())

    expect(result.success).toBe(true)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].pii_type).toBe('email')
    expect((result as typeof result & { aiWarning?: string }).aiWarning).toContain('local model unavailable')
  })

  it('keeps template/table extraction when enrichment rejects', async () => {
    const result = await extractDocumentFromSheets(tableSheets())

    expect(result.success).toBe(true)
    expect(result.tables).toHaveLength(1)
    expect((result as typeof result & { aiWarning?: string }).aiWarning).toContain('local model unavailable')
  })
})

describe('optional AI that cannot run for the task', () => {
  it('skips PII secondary screening without a warning', async () => {
    ai.ready.mockReturnValue(false)

    const result = await scanForPiiFromSheets(piiSheets())

    expect(ai.ready).toHaveBeenCalledWith('pii')
    expect(ai.pii).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.findings.map((finding) => finding.pii_type)).toEqual(['email'])
    expect(result).not.toHaveProperty('aiWarning')
  })

  it('skips extraction enrichment without a warning', async () => {
    ai.ready.mockReturnValue(false)

    const result = await extractDocumentFromSheets(tableSheets())

    expect(ai.ready).toHaveBeenCalledWith('extraction')
    expect(ai.extraction).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.tables).toHaveLength(1)
    expect(result).not.toHaveProperty('aiWarning')
  })
})
