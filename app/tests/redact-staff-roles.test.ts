import { describe, expect, it } from 'vitest'
import {
  applyCodes, assignCodes, buildShareText, detectRules, findCandidates, initialDecisions,
  restoreAnswer, restoredText, type Profile, type SourceDocument,
} from '../shared/redact'

// Entirely synthetic people and report fragments; no patient reports are used.
const profile: Profile = { people: [] }
const doc = (text: string): SourceDocument => ({ id: 'staff', name: 'synthetic.pdf', kind: 'pdf', pages: [{ page: 1, text, source: 'text' }] })

describe('medical staff role fields', () => {
  it.each([
    '检查者', '检查人', '检验者', '检验人', '审核者', '审核人', '评估者', '评估人',
    '复核者', '复核人', '报告者', '报告人', '主检医生', '总审医生', '审核医师', '检验技师',
    '审核者姓名', '评估者签名', '审核姓名', '主检姓名', '主治签名',
  ])('finds the name under %s as a medical staff candidate', (label) => {
    const text = `${label}：陈安宁`
    const found = detectRules(doc(text))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ category: 'name', role: 'doctor', label, reason: 'doctor_label', suggestion: 'replace' })
    expect(text.slice(found[0].start, found[0].end)).toBe('陈安宁')
  })

  it('reads all-Chinese table rows without needing an earlier labelled copy, and stops at clinical headers', () => {
    const text = [
      '审核者\t评估者\t检查项目',
      '陈安宁\t赵嘉禾\t血常规',
      '杜知远\t谢清和\t心电图',
      '项目\t结果\t参考范围',
      '尿蛋白\t阴性\t阴性',
    ].join('\n')
    const found = detectRules(doc(text))
    expect(found.map(({ start, end, role }) => [text.slice(start, end), role])).toEqual([
      ['陈安宁', 'doctor'], ['赵嘉禾', 'doctor'], ['杜知远', 'doctor'], ['谢清和', 'doctor'],
    ])
  })

  it('covers repeated staff names in appended pages and restores one consistent code', async () => {
    const input: SourceDocument = {
      ...doc(''),
      pages: [
        { page: 1, text: '评估者：陈安宁  检查者：赵嘉禾', source: 'text' },
        { page: 2, text: '附加检验报告\n审核者：陈安宁\n总审医生：赵嘉禾', source: 'text' },
        { page: 3, text: '审核者\t评估者\t检查项目\n陈安宁\t赵嘉禾\t血常规', source: 'text' },
      ],
    }
    const candidates = await findCandidates([input], { profile })
    expect(candidates.map(({ page, value, role }) => ({ page, value, role }))).toEqual([
      { page: 1, value: '陈安宁', role: 'doctor' }, { page: 1, value: '赵嘉禾', role: 'doctor' },
      { page: 2, value: '陈安宁', role: 'doctor' }, { page: 2, value: '赵嘉禾', role: 'doctor' },
      { page: 3, value: '陈安宁', role: 'doctor' }, { page: 3, value: '赵嘉禾', role: 'doctor' },
    ])
    const decisions = initialDecisions(candidates)
    // Explicit replacement tests the recognition → code → share → restore chain independently of defaults.
    for (const candidate of candidates) decisions[candidate.id] = 'replace'
    const { book, codeFor } = assignCodes(candidates, decisions, profile, 'en')
    const share = buildShareText([input], applyCodes([input], candidates, codeFor), 'en').text
    expect(share).not.toMatch(/陈安宁|赵嘉禾/)
    expect(share.match(/Doctor-1/g)).toHaveLength(3)
    expect(share.match(/Doctor-2/g)).toHaveLength(3)
    expect(share).toContain('血常规')
    expect(restoredText(restoreAnswer('Doctor-1 / Doctor-2', book, 'en'), new Set())).toBe('陈安宁 / 赵嘉禾')
  })

  it('replaces staff names by default, including standalone copies, with an explicit keep override', async () => {
    const input = doc('审核者：陈安宁\n附注：陈安宁\n评估者：赵嘉禾')
    const candidates = await findCandidates([input], { profile })
    expect(candidates).toHaveLength(3)
    for (const candidate of candidates) expect(candidate).toMatchObject({ role: 'doctor', certainty: 'unsure', suggestion: 'replace' })
    const decisions = initialDecisions(candidates)
    const share = () => {
      const { codeFor } = assignCodes(candidates, decisions, profile, 'en')
      return buildShareText([input], applyCodes([input], candidates, codeFor), 'en').text
    }
    expect(share()).not.toMatch(/陈安宁|赵嘉禾/)
    expect(share().match(/Doctor-1/g)).toHaveLength(2)
    for (const candidate of candidates.filter(({ value }) => value === '赵嘉禾')) decisions[candidate.id] = 'keep'
    expect(share()).toContain('评估者：赵嘉禾')
    expect(share()).not.toContain('陈安宁')
  })

  it('leaves role-related measurements, status, dates and institutions alone', () => {
    const text = [
      '审核：通过', '主治：药物治疗', '主检：未录入',
      '审核结果：通过', '评估结果：低风险', '审核者日期：2025-04-12', '评估者时间：09:30',
      '评估者人数：三人', '评估机构：示例医院', '检查项目：血常规', '检查结果：正常',
    ].join('\n')
    expect(detectRules(doc(text))).toEqual([])
  })
})
