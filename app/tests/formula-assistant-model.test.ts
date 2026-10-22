import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ net: { request: vi.fn() } }))
import { DEFAULT_MODEL } from '../electron/model/downloader'
import { FORMULA_ASSISTANT_MODEL } from '../src/utils/formulaAssistant'
import { formatByteSize, formatExactBytes } from '../src/utils/byteSize'

describe('formula assistant size shown to users', () => {
  it('mirrors the model the main process actually downloads', () => {
    expect(FORMULA_ASSISTANT_MODEL.sizeBytes).toBe(DEFAULT_MODEL.size)
    expect(FORMULA_ASSISTANT_MODEL.fileName).toBe(DEFAULT_MODEL.filename)
  })

  it('uses one decimal-unit format for every size', () => {
    expect(formatByteSize(FORMULA_ASSISTANT_MODEL.sizeBytes)).toBe('1.56 GB')
    expect(formatByteSize(931_000_000)).toBe('931 MB')
    expect(formatByteSize(999_999_999)).toBe('1 GB')
    expect(formatByteSize(12_345)).toBe('12.3 KB')
    expect(formatByteSize(512)).toBe('512 B')
    expect(formatByteSize(Number.NaN)).toBe('')
  })

  it('keeps the exact byte count for technical details', () => {
    expect(formatExactBytes(FORMULA_ASSISTANT_MODEL.sizeBytes)).toBe('1,561,314,592')
  })
})
