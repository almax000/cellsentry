import { describe, expect, it } from 'vitest'
import { cellLabel, cellLabelLocale, excelReference, parseCellAddress } from '../src/utils/cellLabel'

describe('cellLabel', () => {
  it('turns an A1 address into plain words', () => {
    expect(cellLabel('G3', 'zh')).toBe('第 3 行 · G 列')
    expect(cellLabel('G3', 'en')).toBe('Row 3 · Column G')
  })

  it('prefixes the sheet name when given', () => {
    expect(cellLabel('G3', 'zh', 'Invoice Audit')).toBe('Invoice Audit · 第 3 行 · G 列')
    expect(cellLabel('B3', 'en', 'Invoice Audit')).toBe('Invoice Audit · Row 3 · Column B')
  })

  it('accepts regional language tags, absolute and lower-case addresses', () => {
    expect(cellLabel('$aa$80', 'zh-CN')).toBe('第 80 行 · AA 列')
    expect(cellLabel('E11', 'en-US')).toBe('Row 11 · Column E')
    expect(cellLabelLocale(undefined)).toBe('en')
  })

  it('never invents a label for something that is not a single cell', () => {
    expect(cellLabel('A8:E13', 'zh')).toBe('A8:E13')
    expect(cellLabel('Total', 'en', 'Sheet1')).toBe('Sheet1 · Total')
    expect(cellLabel('A0', 'en')).toBe('A0')
    expect(parseCellAddress('')).toBeNull()
  })

  it('keeps the raw Excel reference available for technical details', () => {
    expect(excelReference("Bob's sheet", 'G3')).toBe("'Bob''s sheet'!G3")
  })
})
