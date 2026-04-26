/**
 * Unit tests for jieba-backed whole-token replacement (W3 Step 3.4).
 *
 * Plan v3 mandated 20+ cases including the 张三 / 张三丰 not-pollute case
 * (collision-scan-clean precondition).
 */

import { describe, it, expect } from 'vitest'
import { replaceWithMapping } from './jiebaEngine'
import type { PseudonymMap } from '../types'

function mapWith(patients: Array<{ real: string; aliases?: string[]; pseudonym: string }>): PseudonymMap {
  return {
    version: 1,
    next_pseudonym_index: patients.length,
    source_path: '/tmp/m.md',
    patients: patients.map((p, i) => ({
      patient_id: `p-${i}`,
      real_name: p.real,
      aliases: p.aliases ?? [],
      pseudonym: p.pseudonym,
      date_mode: 'preserve',
      additional_entities: [],
    })),
  }
}

describe('replaceWithMapping — CJK names', () => {
  it('replaces a single CN name', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '患者 张三 主诉胸痛',
    })
    expect(result.output).toContain('患者A')
    expect(result.output).not.toContain('张三')
    expect(result.replacements).toHaveLength(1)
    expect(result.replacements[0].original).toBe('张三')
    expect(result.replacements[0].pseudonym).toBe('患者A')
  })

  it('replaces multiple distinct CN names', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([
        { real: '张三', pseudonym: '患者A' },
        { real: '李四', pseudonym: '患者B' },
      ]),
      text: '医生 王医生 接诊 患者 张三 和 李四',
    })
    expect(result.output).toContain('患者A')
    expect(result.output).toContain('患者B')
    expect(result.output).not.toContain('张三')
    expect(result.output).not.toContain('李四')
  })

  it('keeps cross-document consistency: same name → same pseudonym, every time', async () => {
    const map = mapWith([{ real: '张三', pseudonym: '患者A' }])
    const r1 = await replaceWithMapping({ mapping: map, text: '张三入院' })
    const r2 = await replaceWithMapping({ mapping: map, text: '张三复诊' })
    expect(r1.output).toBe('患者A入院')
    expect(r2.output).toBe('患者A复诊')
  })

  it('replaces aliases to the same pseudonym as real_name (cross-alias consistency)', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', aliases: ['张先生', '老张'], pseudonym: '患者A' }]),
      text: '张三表示, 张先生再次复诊, 老张状态稳定',
    })
    expect(result.output).not.toContain('张三')
    expect(result.output).not.toContain('张先生')
    expect(result.output).not.toContain('老张')
    expect((result.output.match(/患者A/g) ?? []).length).toBe(3)
  })

  it('does NOT pollute 张三丰 when 张三丰 is in the mapping (longest-key wins)', async () => {
    // Both shorter and longer in mapping → jieba's user-dict at weight 99999
    // tokenizes whichever is the longest match starting at that position.
    const result = await replaceWithMapping({
      mapping: mapWith([
        { real: '张三', pseudonym: '患者A' },
        { real: '张三丰', pseudonym: '武术家A' },
      ]),
      text: '张三丰创立太极拳, 张三是另一个人',
    })
    // 张三丰 → 武术家A (whole longer token replaced)
    expect(result.output).toContain('武术家A创立太极拳')
    // 张三 (standalone after comma) → 患者A
    expect(result.output).toContain('患者A是另一个人')
  })

  it('handles same-name appearing inside punctuation correctly', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '"张三", 男性, 32 岁',
    })
    expect(result.output).toContain('患者A')
    expect(result.output).not.toContain('张三')
  })

  it('preserves whitespace + punctuation around replaced names', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '【张三】, 主诉如下:\n胸痛.',
    })
    expect(result.output).toContain('【患者A】')
    expect(result.output).toContain('胸痛.')
  })

  it('returns text unchanged when mapping is empty', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([]),
      text: '张三入院',
    })
    expect(result.output).toBe('张三入院')
    expect(result.replacements).toEqual([])
  })

  it('returns text unchanged when text contains no mapping keys', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '没有任何相关人名',
    })
    expect(result.output).toBe('没有任何相关人名')
    expect(result.replacements).toEqual([])
  })
})

describe('replaceWithMapping — English names', () => {
  it('replaces an English name with word-boundary regex', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: 'John Smith', pseudonym: 'Patient A' }]),
      text: 'Dr. John Smith said patient is stable.',
    })
    expect(result.output).toBe('Dr. Patient A said patient is stable.')
  })

  it('does NOT replace English name embedded in a longer word', async () => {
    // 'John' inside 'Johnson' should NOT match.
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: 'John', pseudonym: 'Patient A' }]),
      text: 'Mr. Johnson came in.',
    })
    expect(result.output).toContain('Johnson')
    expect(result.output).not.toContain('Patient A')
  })

  it('replaces multiple English-name occurrences', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: 'Mary', pseudonym: 'Patient B' }]),
      text: 'Mary came in. Mary returned for follow-up.',
    })
    expect(result.output).not.toContain('Mary')
    expect((result.output.match(/Patient B/g) ?? []).length).toBe(2)
  })
})

describe('replaceWithMapping — mixed CJK + English', () => {
  it('handles same patient with both CN real_name and EN alias', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([
        { real: '张三', aliases: ['Zhang San'], pseudonym: '患者A' },
      ]),
      text: '张三 (Zhang San) 入院.',
    })
    expect(result.output).not.toContain('张三')
    expect(result.output).not.toContain('Zhang San')
    expect((result.output.match(/患者A/g) ?? []).length).toBe(2)
  })
})

describe('replaceWithMapping — additional entities', () => {
  it('replaces additional_entities (family members)', async () => {
    const map: PseudonymMap = {
      version: 1,
      next_pseudonym_index: 1,
      source_path: '/tmp/m.md',
      patients: [{
        patient_id: 'p-0',
        real_name: '张三',
        aliases: [],
        pseudonym: '患者A',
        date_mode: 'preserve',
        additional_entities: [{ real: '李四', pseudonym: '家属A' }],
      }],
    }
    const result = await replaceWithMapping({
      mapping: map,
      text: '张三的女儿李四陪同',
    })
    expect(result.output).toContain('患者A')
    expect(result.output).toContain('家属A')
    expect(result.output).not.toContain('李四')
  })
})

describe('replaceWithMapping — structural', () => {
  it('returns replacement spans pointing into the OUTPUT (post-substitution)', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '张三 入院',
    })
    const r = result.replacements[0]
    expect(result.output.slice(r.span[0], r.span[1])).toBe(r.pseudonym)
  })

  it('marks every replacement as reason: mapping', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '张三 来了, 张三 走了',
    })
    expect(result.replacements.every(r => r.reason === 'mapping')).toBe(true)
  })

  it('handles repeated occurrences and emits one replacement per occurrence', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '张三 张三 张三',
    })
    expect(result.replacements).toHaveLength(3)
  })

  it('handles empty input gracefully', async () => {
    const result = await replaceWithMapping({
      mapping: mapWith([{ real: '张三', pseudonym: '患者A' }]),
      text: '',
    })
    expect(result.output).toBe('')
    expect(result.replacements).toEqual([])
  })
})
