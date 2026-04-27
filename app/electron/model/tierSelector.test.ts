/**
 * Tier-selection unit tests (lean rebuild — D35).
 */

import { describe, it, expect } from 'vitest'

import { autoTierFromRam } from './tierSelector'

const GIB = 1024 * 1024 * 1024

describe('autoTierFromRam — D35 three-tier RAM gates', () => {
  it('treats 16 GB Mac (~17.18 GB binary) as bf16', () => {
    expect(autoTierFromRam(17.18 * GIB)).toBe('bf16')
  })

  it('treats 12 GB exact threshold as bf16 (boundary inclusive)', () => {
    expect(autoTierFromRam(12 * GIB)).toBe('bf16')
  })

  it('treats just below 12 GB as 8-bit', () => {
    expect(autoTierFromRam(12 * GIB - 1)).toBe('8bit')
  })

  it('treats 8 GB Mac (~8.59 GB binary) as 8-bit', () => {
    expect(autoTierFromRam(8.59 * GIB)).toBe('8bit')
  })

  it('treats 6 GB exact threshold as 8-bit', () => {
    expect(autoTierFromRam(6 * GIB)).toBe('8bit')
  })

  it('treats just below 6 GB as 4-bit', () => {
    expect(autoTierFromRam(6 * GIB - 1)).toBe('4bit')
  })

  it('treats 4 GB old Intel Mac as 4-bit', () => {
    expect(autoTierFromRam(4 * GIB)).toBe('4bit')
  })

  it('treats 0 RAM as 4-bit (degenerate but defined)', () => {
    expect(autoTierFromRam(0)).toBe('4bit')
  })
})
