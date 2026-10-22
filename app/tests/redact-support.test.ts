import { describe, expect, it } from 'vitest'
import { assignCodes, detectRules, findCandidates, initialDecisions, parseFields, type Profile } from '../shared/redact'
import { sanitizeProfile } from '../shared/redact/ipc'
import { maskValue, personCode } from '../src/components/redact/redactFormat'

// Made-up values only.
describe('My info validation', () => {
  it('keeps the stored shape and drops nothing valid', () => {
    const profile = { people: [{ id: 'me', role: 'self', name: '张伟', phone: '13912345678' }, { id: 'mom', role: 'family', relation: '妈妈' }] }
    expect(sanitizeProfile(profile)).toEqual(profile)
  })

  it('rejects anything that is not the stored shape', () => {
    expect(sanitizeProfile(null)).toBeNull()
    expect(sanitizeProfile({ people: [{ id: 'x', role: 'boss' }] })).toBeNull()
    expect(sanitizeProfile({ people: [{ id: '../x', role: 'self' }] })).toBeNull()
    expect(sanitizeProfile({ people: [{ id: 'a', role: 'self' }, { id: 'b', role: 'self' }] })).toBeNull()
    expect(sanitizeProfile({ people: [{ id: 'a', role: 'self', name: 'x'.repeat(201) }] })).toBeNull()
    expect(sanitizeProfile({ people: [{ id: 'a', role: 'self', name: 42 }] })).toBeNull()
  })

  it('caps the number of people', () => {
    const people = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, role: 'family' }))
    expect(sanitizeProfile({ people })?.people).toHaveLength(20)
  })
})

describe('tables', () => {
  it('reads cells under a tab-separated header row', () => {
    const text = '姓名\t联系电话\t家庭住址\n张伟\t13912345678\t虚构市示例区测试路1号\n\n备注：无'
    const found = detectRules({ id: 'a', name: 'a', kind: 'text', pages: [{ page: 1, text, source: 'text' }] })
    expect(found.map((c) => [c.category, text.slice(c.start, c.end)])).toEqual([
      ['name', '张伟'],
      ['address', '虚构市示例区测试路1号'],
      ['phone', '13912345678'],
    ])
  })

  it('reads OCR rows separated by wide spaces, but not a sentence', () => {
    expect(parseFields('姓名  性别  年龄\n张伟  男  45').map((field) => field.label)).toEqual(['姓名', '性别', '年龄'])
    expect(parseFields('今天  天气  很好')).toEqual([])
  })

  it('reads a quoted value after 为', () => {
    const text = '登记核对：家庭住址为“虚构市示例区测试路1号”。'
    const found = detectRules({ id: 'a', name: 'a', kind: 'text', pages: [{ page: 1, text, source: 'text' }] })
    expect(found.map((c) => text.slice(c.start, c.end))).toEqual(['虚构市示例区测试路1号'])
  })
})

describe('display helpers', () => {
  it('shortens numbers and long addresses for list views', () => {
    expect(maskValue('phone', '139 1234 5678')).toBe('139 **** 5678')
    expect(maskValue('id_number', '11010519491231002X')).toBe('1101 **** **** 002X')
    expect(maskValue('address', '虚构市示例区测试路100号5幢')).toBe('虚构市示例区……')
    expect(maskValue('name', '张伟')).toBe('张伟')
    expect(maskValue('email', 'zhang@example.org')).toBe('z***@example.org')
  })

  it('shows the same letters the code book assigns', async () => {
    const profile: Profile = { people: [{ id: 'mom', role: 'family', name: '王丽华' }, { id: 'me', role: 'self', name: '张伟' }] }
    expect(personCode(profile, 'me', 'zh')).toBe('患者A')
    expect(personCode(profile, 'mom', 'zh')).toBe('家人B')
    const docs = [{ id: 'a', name: 'a', kind: 'text' as const, pages: [{ page: 1, text: '王丽华陪同张伟复查', source: 'paste' as const }] }]
    const candidates = await findCandidates(docs, { profile })
    const { book } = assignCodes(candidates, initialDecisions(candidates), profile, 'zh')
    expect(Object.fromEntries(book.entries.map((entry) => [entry.display, entry.code]))).toEqual({ 王丽华: '家人B', 张伟: '患者A' })
  })
})
