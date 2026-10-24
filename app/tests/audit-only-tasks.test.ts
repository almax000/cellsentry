import { describe, expect, it } from 'vitest'
import {
  TASKS,
  TASK_ORDER,
  classifyFileName,
  classifyMimeType,
  taskForRoute,
} from '../src/tasks'

describe('audit-only product tasks', () => {
  it('exposes audit as the only task and only task route', () => {
    expect(TASK_ORDER).toEqual(['audit'])
    expect(Object.keys(TASKS)).toEqual(['audit'])
    expect(taskForRoute('/audit')).toMatchObject({ id: 'audit', route: '/audit', allowsBatch: true })
    expect(taskForRoute('/pii')).toBeNull()
    expect(taskForRoute('/extract')).toBeNull()
  })

  it('accepts spreadsheets for audit and rejects document inputs', () => {
    expect(classifyFileName('quarterly-close.xlsx')).toBe('spreadsheet')
    expect(classifyFileName('ledger.csv')).toBe('spreadsheet')
    expect(classifyMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet')
    expect(classifyMimeType('text/csv')).toBe('spreadsheet')

    expect(classifyFileName('invoice.pdf')).toBe('unsupported')
    expect(classifyFileName('receipt.png')).toBe('unsupported')
    expect(classifyMimeType('application/pdf')).toBe('unsupported')
    expect(classifyMimeType('image/png')).toBe('unsupported')
  })
})
