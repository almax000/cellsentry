/**
 * Unit tests for collision pre-scan (W3 Step 3.3 / AD3).
 *
 * Critical must-pass: 张三 in mapping + 张三丰 in input flags the overlap.
 */

import { describe, it, expect } from 'vitest'
import { scanForCollisions } from './collisionScan'
import type { PseudonymMap } from '../types'

function mapWith(patients: Array<{ real: string; aliases?: string[] }>): PseudonymMap {
  return {
    version: 1,
    next_pseudonym_index: patients.length,
    source_path: '/tmp/m.md',
    patients: patients.map((p, i) => ({
      patient_id: `p-${i}`,
      real_name: p.real,
      aliases: p.aliases ?? [],
      pseudonym: `患者${String.fromCharCode(65 + i)}`,
      date_mode: 'preserve',
      additional_entities: [],
    })),
  }
}

// ---------------------------------------------------------------------------
// Critical test (the AD3 must-pass)
// ---------------------------------------------------------------------------

describe('scanForCollisions — AD3 critical case', () => {
  it('flags 张三丰 when mapping has 张三', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: ['张三丰在武当山创立太极拳'],
    })
    expect(out).toHaveLength(1)
    expect(out[0].shorter).toBe('张三')
    expect(out[0].longer).toContain('张三丰')
    // The longer should INCLUDE 张三 as a substring AND not be 张三 itself.
    expect(out[0].longer).not.toBe('张三')
    expect(out[0].longer.includes('张三')).toBe(true)
  })

  it('does NOT flag when mapping is empty', () => {
    const out = scanForCollisions({
      mapping: mapWith([]),
      chunks: ['张三丰在武当山'],
    })
    expect(out).toEqual([])
  })

  it('does NOT flag standalone 张三 (no CJK adjacent)', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: ['患者 张三, 男性, 32 岁'],
    })
    expect(out).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Multi-key + multi-chunk
// ---------------------------------------------------------------------------

describe('scanForCollisions — multi-key + multi-chunk', () => {
  it('finds collisions for keys that are themselves NOT in mapping', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }, { real: '李四' }]),
      chunks: ['张三丰和李四光是不同的人'],
    })
    expect(out.map(w => w.shorter).sort()).toEqual(['张三', '李四'])
  })

  it('does NOT flag when the longer name IS already in the mapping', () => {
    // mapping has 张三 AND 张三丰 — the longer key takes precedence; no
    // collision should be reported for 张三 inside 张三丰.
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三丰' }, { real: '张三' }]),
      chunks: ['张三丰在武当山创立太极拳, 张三是另一个人'],
    })
    expect(out).toEqual([])
  })

  it('aggregates contexts across multiple occurrences (capped at 3)', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: [
        '张三丰一次, 张三丰二次, 张三丰三次, 张三丰四次',
      ],
    })
    expect(out).toHaveLength(1)
    expect(out[0].contexts.length).toBeLessThanOrEqual(3)
    expect(out[0].contexts.length).toBeGreaterThan(0)
  })

  it('processes multiple chunks (one collision in each)', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: ['张三丰前一日记录', '张三丰后一日复诊'],
    })
    expect(out).toHaveLength(1)
    expect(out[0].contexts.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Aliases + edge cases
// ---------------------------------------------------------------------------

describe('scanForCollisions — aliases + edge cases', () => {
  it('flags overlap on alias keys (not just real_name)', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三', aliases: ['老张'] }]),
      chunks: ['老张三天前来过'],
    })
    expect(out.length).toBeGreaterThanOrEqual(1)
    // Either the 张三 OR the 老张 matches — depending on extension direction.
    // What matters: at least one of them flags an overlap.
    expect(out.some(w => w.shorter === '张三' || w.shorter === '老张')).toBe(true)
  })

  it('skips ASCII-only mapping keys (handled by word-boundary regex in jieba step)', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: 'John' }]),
      chunks: ['Johnson came in for a checkup'],
    })
    // English collision detection is jiebaEngine.ts territory (W3 Step 3.4),
    // not collisionScan's. This step only catches CJK overlaps.
    expect(out).toEqual([])
  })

  it('handles empty input gracefully', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: [''],
    })
    expect(out).toEqual([])
  })

  it('handles input with no CJK gracefully', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: ['Patient information: 32 yo male, normal exam findings.'],
    })
    expect(out).toEqual([])
  })

  it('respects MAX_EXTEND cap (4 chars on each side)', () => {
    const out = scanForCollisions({
      mapping: mapWith([{ real: '张三' }]),
      chunks: ['张三丰张三丰张三丰张三丰非常长的句子'],
    })
    // Should flag overlaps without producing unboundedly long "longer" strings.
    expect(out.length).toBeGreaterThan(0)
    for (const w of out) {
      // Total length capped at shorter.length + 2*MAX_EXTEND = 2 + 8 = 10 chars.
      expect(w.longer.length).toBeLessThanOrEqual(10)
    }
  })
})
