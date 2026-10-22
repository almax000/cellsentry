import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => 'test' } }))

import { generateReport } from '../electron/report/generator'
import { exportToCsv, exportToJson } from '../electron/extraction/exporters'
import { maskValue } from '../electron/pii/masking'

describe('report export', () => {
  it('normalizes renderer severities before counting and rendering', () => {
    const report = generateReport([
      { severity: 'error', sheet_name: 'S', cell_address: 'A1', message: 'bad' },
      { severity: 'warning', sheet_name: 'S', cell_address: 'A2', message: 'watch' },
      { severity: 'info', sheet_name: 'S', cell_address: 'A3', message: 'note' },
    ], 'input.xlsx')

    expect(report).toContain('Errors: 1')
    expect(report).toContain('Warnings: 1')
    expect(report).toContain('Info: 1')
    expect(report).toContain('>Error<')
    expect(report).toContain('>Warning<')
  })
})

describe('extraction export', () => {
  const fields = [{ key: 'amount', label: 'Amount', value: '=1+1', cell: 'A1', sheet_name: 'Sheet1', confidence: 1 }]
  const tables = [{ sheet_name: 'Sheet1', header_row: 1, headers: ['Value'], rows: [['-12'], ['@SUM(A1:A2)']], start_cell: 'A1', end_cell: 'A3' }]

  it('keeps the structured JSON data intact', () => {
    expect(JSON.parse(exportToJson(fields, tables))).toEqual({ fields, tables })
  })

  it('neutralizes formula-like CSV text while retaining ordinary negative numbers', () => {
    const csv = exportToCsv(fields, tables)
    expect(csv).toContain("Amount,'=1+1,A1,Sheet1,1")
    expect(csv).toContain('\n-12\n')
    expect(csv).toContain("'@SUM(A1:A2)")
  })
})

describe('PII masking', () => {
  it('uses the same stable mask for preview and export', () => {
    expect(maskValue('jane@example.com', 'email')).toBe('j***@example.com')
    expect(maskValue('+1 415-555-2671', 'phone')).toBe('141****2671')
  })
})
