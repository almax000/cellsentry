import { describe, expect, it, vi } from 'vitest'

vi.mock('../electron/llm/lifecycle', () => ({
  isLocalAiReadyFor: () => true,
  analyzeWithLlmExtraction: vi.fn().mockResolvedValue(null),
}))

import { extractDocumentFromSheets } from '../electron/extraction/extractor'
import type { CellInfo, SheetContext } from '../electron/engine/types'

function cell(address: string, row: number, column: number, value: string): CellInfo {
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

function invoiceSheet(entries: Array<[string, string]>): SheetContext {
  const cells: Record<string, CellInfo> = {
    A1: cell('A1', 1, 1, 'Tax Invoice'),
  }
  const rowLabels: Record<number, string> = { 1: 'Tax Invoice' }
  let row = 2
  for (const [label, value] of entries) {
    cells[`A${row}`] = cell(`A${row}`, row, 1, label)
    cells[`B${row}`] = cell(`B${row}`, row, 2, value)
    rowLabels[row] = label
    row++
  }

  return {
    name: 'Invoice',
    maxRow: row - 1,
    maxColumn: 2,
    cells,
    mergedRanges: [],
    headers: {},
    rowLabels,
    reportType: null,
  }
}

async function fieldsFor(entries: Array<[string, string]>) {
  const result = await extractDocumentFromSheets([invoiceSheet(entries)])
  expect(result.success).toBe(true)
  expect(result.document_type).toBe('invoice')
  return new Map(result.fields.map((field) => [field.key, field]))
}

describe('template field label matching', () => {
  it('chooses the exact Total label after a preceding Subtotal', async () => {
    const fields = await fieldsFor([
      ['Subtotal', '300'],
      ['Total', '601'],
      ['Invoice Number', 'INV-601'],
      ['Date', '2026-10-16'],
    ])

    expect(fields.get('subtotal')).toMatchObject({ value: '300', cell: 'B2' })
    expect(fields.get('total')).toMatchObject({ value: '601', cell: 'B3', confidence: 0.9 })
  })

  it('keeps trailing-colon labels and multi-word English synonyms', async () => {
    const fields = await fieldsFor([
      ['Invoice Number:', 'INV-42'],
      ['Amount Due', '601'],
      ['Date:', '2026-10-16'],
    ])

    expect(fields.get('invoice_number')).toMatchObject({ value: 'INV-42', cell: 'B2' })
    expect(fields.get('date')).toMatchObject({ value: '2026-10-16', cell: 'B4' })
    expect(fields.get('total')).toMatchObject({ value: '601', cell: 'B3' })
  })

  it('keeps Chinese labels and full-width trailing colons', async () => {
    const fields = await fieldsFor([
      ['小计', '300'],
      ['总额：', '601'],
      ['发票号', 'CN-601'],
    ])

    expect(fields.get('subtotal')).toMatchObject({ value: '300', cell: 'B2' })
    expect(fields.get('total')).toMatchObject({ value: '601', cell: 'B3' })
    expect(fields.get('invoice_number')).toMatchObject({ value: 'CN-601', cell: 'B4' })
  })
})

describe('field ownership and match priority', () => {
  it.each(['Subtotal', 'Sub-total', 'Sub total'])(
    'does not infer a total from a standalone subtotal alias: %s',
    async (subtotalLabel) => {
      const fields = await fieldsFor([
        [subtotalLabel, '300'],
        ['Invoice Number', 'INV-300'],
        ['Date', '2026-10-16'],
      ])

      expect(fields.get('subtotal')).toMatchObject({ value: '300', cell: 'B2' })
      expect(fields.has('total')).toBe(false)
    },
  )

  it('does not infer tax from the subtotal alias Amount before tax', async () => {
    const fields = await fieldsFor([
      ['Amount before tax', '300'],
      ['Invoice Number', 'INV-300'],
      ['Date', '2026-10-16'],
    ])

    expect(fields.get('subtotal')).toMatchObject({ value: '300', cell: 'B2' })
    expect(fields.has('tax')).toBe(false)
  })

  it('uses an exact row-label value before a relaxed direct match', async () => {
    const sheet = invoiceSheet([])
    sheet.maxRow = 4
    sheet.maxColumn = 5
    sheet.cells.A2 = cell('A2', 2, 1, 'Total tax')
    sheet.cells.B2 = cell('B2', 2, 2, '50')
    sheet.cells.A3 = cell('A3', 3, 1, 'Subtotal')
    sheet.cells.E3 = cell('E3', 3, 5, '300')
    sheet.cells.A4 = cell('A4', 4, 1, 'Total')
    sheet.cells.E4 = cell('E4', 4, 5, '601')
    sheet.rowLabels = { 1: 'Tax Invoice', 2: 'Total tax', 3: 'Subtotal', 4: 'Total' }

    const result = await extractDocumentFromSheets([sheet])
    const fields = new Map(result.fields.map((field) => [field.key, field]))

    expect(fields.get('total')).toMatchObject({ value: '601', cell: 'E4', confidence: 0.7 })
  })
})
