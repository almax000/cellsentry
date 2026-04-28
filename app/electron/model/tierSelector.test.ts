/**
 * Tier-selection unit tests (lean rebuild — D35 + 2026-04-28 audit).
 *
 * autoTierFromRam is the pure RAM-to-PaddleOCR-VL-tier mapping; it's still
 * used when the user opts in and we need to pick the right quantization.
 *
 * selectOcrTier defaults to 'disabled' now (post-audit). Tests for the
 * default behavior + env-var override live below.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { autoTierFromRam, isOcrEnabled, selectOcrTier } from './tierSelector'

const GIB = 1024 * 1024 * 1024

describe('autoTierFromRam — D35 RAM gates (used when user opts in)', () => {
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

describe('selectOcrTier — default disabled, env override switches on', () => {
  const originalEnv = process.env.CELLSENTRY_OCR_TIER

  beforeEach(() => {
    delete process.env.CELLSENTRY_OCR_TIER
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CELLSENTRY_OCR_TIER
    } else {
      process.env.CELLSENTRY_OCR_TIER = originalEnv
    }
  })

  it('defaults to disabled when env var is not set', () => {
    expect(selectOcrTier()).toBe('disabled')
    expect(isOcrEnabled()).toBe(false)
  })

  it('respects explicit disabled override', () => {
    process.env.CELLSENTRY_OCR_TIER = 'disabled'
    expect(selectOcrTier()).toBe('disabled')
    expect(isOcrEnabled()).toBe(false)
  })

  it('respects bf16 override', () => {
    process.env.CELLSENTRY_OCR_TIER = 'bf16'
    expect(selectOcrTier()).toBe('bf16')
    expect(isOcrEnabled()).toBe(true)
  })

  it('respects 8bit override', () => {
    process.env.CELLSENTRY_OCR_TIER = '8bit'
    expect(selectOcrTier()).toBe('8bit')
    expect(isOcrEnabled()).toBe(true)
  })

  it('respects 4bit override', () => {
    process.env.CELLSENTRY_OCR_TIER = '4bit'
    expect(selectOcrTier()).toBe('4bit')
    expect(isOcrEnabled()).toBe(true)
  })

  it('respects ds-ocr-2 fallback override', () => {
    process.env.CELLSENTRY_OCR_TIER = 'ds-ocr-2'
    expect(selectOcrTier()).toBe('ds-ocr-2')
    expect(isOcrEnabled()).toBe(true)
  })

  it('ignores invalid env value (keeps default disabled)', () => {
    process.env.CELLSENTRY_OCR_TIER = 'banana'
    expect(selectOcrTier()).toBe('disabled')
    expect(isOcrEnabled()).toBe(false)
  })
})
