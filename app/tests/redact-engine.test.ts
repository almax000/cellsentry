import { describe, expect, it } from 'vitest'
import {
  applyCodes, assignCodes, buildShareText, checkResidue, detectRules, findCandidates, findValue, initialDecisions, mergeBooks, normalizeText,
  resolveHits, restoreAnswer, restoredText, seedOf, sourceOf,
  type Candidate, type CodeBook, type Detector, type Profile, type SourceDocument,
} from '../shared/redact'

// All people, numbers and addresses below are made up for tests.
const VALID_ID = '11010519491231002X'
const BAD_CHECKSUM_ID = '110105194912310021'

const report2025 = [
  '2025 年度健康体检报告',
  '姓名：张伟  性别：男  年龄：45 岁',
  `身份证号：${VALID_ID}`,
  '体检编号：TJ20250001  联系电话：139 1234 5678',
  '家属：王丽华  主检医生：李建国',
  '住址：杭州市西湖区文三路100号',
  '检查机构：上海市第一人民医院',
  '总胆固醇 6.2 mmol/L ↑ < 5.2',
  '物流订单号（不是联系电话）：13800200000',
].join('\n')

const report2024 = ['2024 年度健康体检报告', '姓名：张伟', '联系电话：13912345678', '总胆固醇 5.6 mmol/L ↑'].join('\n')

function doc(id: string, text: string, name = `${id}.pdf`): SourceDocument {
  return { id, name, kind: 'pdf', pages: [{ page: 1, text, source: 'text' }] }
}

const empty: Profile = { people: [] }
const profile: Profile = {
  people: [
    { id: 'me', role: 'self', name: '张伟', phone: '+86 13912345678', idNumber: VALID_ID, address: '杭州市西湖区文三路100号' },
    { id: 'mom', role: 'family', relation: '妈妈', name: '王丽华' },
  ],
}

const byValue = (candidates: Candidate[], value: string): Candidate | undefined => candidates.find((c) => c.value === value)

async function run(docs: SourceDocument[], who: Profile = profile, locale: 'zh' | 'en' = 'zh') {
  const candidates = await findCandidates(docs, { profile: who })
  const decisions = initialDecisions(candidates)
  const { book, codeFor } = assignCodes(candidates, decisions, who, locale)
  const share = buildShareText(docs, applyCodes(docs, candidates, codeFor), locale)
  return { candidates, decisions, book, codeFor, share }
}

describe('rule detector', () => {
  it('finds labelled personal fields and leaves medical context alone', () => {
    const found = detectRules(doc('a', report2025))
    const text = (category: string) => found.filter((c) => c.category === category).map((c) => report2025.slice(c.start, c.end))
    expect(text('name')).toEqual(['张伟', '王丽华', '李建国'])
    expect(text('id_number')).toEqual([VALID_ID])
    expect(text('record_number')).toEqual(['TJ20250001'])
    expect(text('phone')).toEqual(['139 1234 5678'])
    expect(text('address')).toEqual(['杭州市西湖区文三路100号'])
    const doctor = found.find((c) => c.role === 'doctor')
    expect(doctor).toMatchObject({ suggestion: 'keep', certainty: 'unsure' })
    expect(found.find((c) => c.role === 'family')).toMatchObject({ certainty: 'unsure', suggestion: 'replace' })
    // Hospital, lab values and an order number that looks like a phone stay as they are.
    expect(found.some((c) => report2025.slice(c.start, c.end).includes('医院'))).toBe(false)
    expect(found.some((c) => report2025.slice(c.start, c.end).includes('13800200000'))).toBe(false)
    expect(found.some((c) => /6\.2|5\.2/.test(report2025.slice(c.start, c.end)))).toBe(false)
  })

  it('keeps an ID with a bad checksum when a label says it is an ID, and asks otherwise', () => {
    const labelled = detectRules(doc('a', `证件号码：${BAD_CHECKSUM_ID}`))
    expect(labelled[0]).toMatchObject({ category: 'id_number', certainty: 'sure', reason: 'id_under_label' })
    const bare = detectRules(doc('b', `复印件上的号码 ${BAD_CHECKSUM_ID} 看不清`))
    expect(bare[0]).toMatchObject({ category: 'id_number', certainty: 'unsure' })
    const teaching = detectRules(doc('c', `校验教学代码（非个人证件）：${BAD_CHECKSUM_ID}`))
    expect(teaching).toHaveLength(0)
  })

  it('splits labels glued to the previous value', () => {
    const found = detectRules(doc('a', '姓名：张伟性别：男'))
    expect(found.map((c) => c.category)).toEqual(['name'])
    expect('姓名：张伟性别：男'.slice(found[0].start, found[0].end)).toBe('张伟')
  })

  it('reads names out of free text, skipping words that only follow 患者', () => {
    const text = '患者张伟，男，45岁。患者自述头痛三天。家属王丽华陪同。'
    const names = detectRules(doc('a', text)).map((c) => text.slice(c.start, c.end))
    expect(names).toEqual(['张伟', '王丽华'])
  })
})

describe('my info', () => {
  it('matches the user and family across spacing and country codes, and wins over rules', async () => {
    const candidates = await findCandidates([doc('a', report2025)], { profile })
    expect(byValue(candidates, '139 1234 5678')).toMatchObject({ source: 'profile', certainty: 'sure', personId: 'me' })
    expect(byValue(candidates, '王丽华')).toMatchObject({ source: 'profile', certainty: 'sure', personId: 'mom', role: 'family' })
    expect(byValue(candidates, '杭州市西湖区文三路100号')).toMatchObject({ source: 'profile' })
  })

  it('asks before replacing a name that may be part of a longer name', async () => {
    const candidates = await findCandidates([doc('a', '复查人：张伟华')], { profile })
    expect(byValue(candidates, '张伟')).toMatchObject({ certainty: 'unsure' })
  })
})

describe('codes, sharing and the leftover check', () => {

  it('gives the same person and number the same code in every file', async () => {
    const { share, book } = await run([doc('y2025', report2025, '张伟-2025.pdf'), doc('y2024', report2024, '张伟-2024.pdf')])
    expect(share.text).toContain('【文件 1】')
    expect(share.text).toContain('【文件 2】')
    expect(share.text).not.toContain('张伟')
    expect(share.text.match(/患者A/g)).toHaveLength(2)
    expect(share.text.match(/电话1/g)).toHaveLength(2)
    expect(share.text).toContain('家属：家人B')
    // Doctors, hospitals and lab values stay so the AI can still read the report.
    expect(share.text).toContain('主检医生：李建国')
    expect(share.text).toContain('上海市第一人民医院')
    expect(share.text).toContain('总胆固醇 6.2 mmol/L')
    expect(book.entries.find((entry) => entry.code === '电话1')?.values).toEqual(['139 1234 5678', '13912345678'])
  })

  it('numbers people found without "My info" after the reserved letters', async () => {
    const { share } = await run([doc('a', report2025)], empty)
    expect(share.text).toContain('姓名：患者A')
    expect(share.text).toContain('家属：家人B')
  })

  it('uses English codes for the English interface', async () => {
    const { share } = await run([doc('a', report2024)], profile, 'en')
    expect(share.text).toContain('[File 1]')
    expect(share.text).toContain('Patient-A')
    expect(share.text).toContain('Phone-1')
  })

  it('reports zero leftovers for a clean result', async () => {
    const { share, book } = await run([doc('a', report2025)])
    expect(checkResidue(share, book, profile)).toEqual([])
  })

  it('finds a replaced value again where the rules skipped it, and replaces it with the same code', async () => {
    // The courier note is background for the rules; propagation still finds the same number there.
    const docs = [doc('a', `${report2024}\n快递单备注：139-1234-5678\n快递单：+8613912345678`)]
    const { share, book } = await run(docs, empty)
    expect(share.text).toContain('快递单备注：电话1')
    expect(share.text).toContain('快递单：电话1')
    expect(share.text).not.toMatch(/1391234|139-1234/)
    expect(checkResidue(share, book, empty)).toEqual([])
  })

  it('finds a number glued to letters and gives it the same code', async () => {
    const docs = [doc('a', '联系电话：13912345678\n快递单：TEL13912345678')]
    const { share, book } = await run(docs, empty)
    expect(share.text).toContain('快递单：TEL电话1')
    expect(checkResidue(share, book, empty)).toEqual([])
  })

  it('a spot kept only by default still blocks, until the user decides on that exact spot', async () => {
    const docs = [doc('a', '姓名：张伟\n张伟于2025年入院。复查人：张伟华')]
    const first = await run(docs, empty)
    const glued = first.candidates.find((c) => c.reason === 'same_value' && c.suggestion === 'keep') as Candidate
    const hits = checkResidue(first.share, first.book, empty)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ kind: 'replaced_value', category: 'name', value: '张伟' })
    // The hit is that candidate, so deciding on it is what the share page does.
    const pageText = (docId: string, page: number) => docs.find((d) => d.id === docId)?.pages.find((p) => p.page === page)?.text
    const resolved = resolveHits(hits, first.share, first.candidates, empty, pageText)
    expect(resolved).toEqual({ added: [], existing: [glued.id], removed: [] })
    for (const decision of ['keep', 'not_pii'] as const) {
      const decisions = { ...first.decisions, [glued.id]: decision }
      const { book, codeFor } = assignCodes(first.candidates, decisions, empty, 'zh')
      const share = buildShareText(docs, applyCodes(docs, first.candidates, codeFor, new Set([glued.id])), 'zh')
      expect(share.text).toContain('复查人：张伟华')
      expect(checkResidue(share, book, empty)).toEqual([])
    }
  })

  it('turns a leftover that only partly overlaps a candidate into one candidate over both', () => {
    const text = '电话：8613912345678'
    const docs = [doc('a', text)]
    const start = text.indexOf('139')
    const partial: Candidate = { id: `a:1:${start}-${start + 11}`, docId: 'a', page: 1, start, end: start + 11, value: '13912345678',
      category: 'phone', source: 'rule', certainty: 'sure', reason: 'phone_shape', suggestion: 'keep' }
    const share = buildShareText(docs, applyCodes(docs, [partial], {}), 'zh')
    const at = share.text.indexOf('86139')
    const hit = { kind: 'replaced_value' as const, category: 'phone' as const, value: '8613912345678', start: at, end: at + 13 }
    const resolved = resolveHits([hit], share, [partial], empty, () => text)
    expect(resolved.removed).toEqual([partial.id])
    expect(resolved.existing).toEqual([])
    expect(resolved.added.map((c) => [c.value, c.reason, c.suggestion])).toEqual([['8613912345678', 'leftover', 'replace']])
  })

  it('reads full-width digits and OCR double spaces as the same number', async () => {
    const docs = [doc('a', '联系电话：１３９１２３４５６７８\n家属电话：137  0000  1111')]
    const { share, book, candidates } = await run(docs, empty)
    expect(candidates.filter((c) => c.category === 'phone').map((c) => c.value)).toEqual(['１３９１２３４５６７８', '137  0000  1111'])
    expect(share.text).toContain('联系电话：电话1')
    expect(share.text).toContain('家属电话：电话2')
    expect(checkResidue(share, book, empty)).toEqual([])
  })

  it('finds a labelled name again in the narrative, but asks about it inside a longer name', async () => {
    const docs = [doc('a', '姓名：张伟\n张伟于2025年入院。复查人：张伟华')]
    const { share, book, candidates } = await run(docs, empty)
    const repeats = candidates.filter((c) => c.reason === 'same_value')
    expect(repeats.map((c) => [c.value, c.certainty, c.suggestion])).toEqual([['张伟', 'unsure', 'replace'], ['张伟', 'unsure', 'keep']])
    expect(share.text).toContain('患者A于2025年入院')
    expect(share.text).toContain('复查人：张伟华')
    // A default "keep" is not a decision: the spot inside 张伟华 is reported until the user looks at it.
    expect(checkResidue(share, book, empty).map((hit) => hit.value)).toEqual(['张伟'])
  })

  it('exempts only the exact spot the user kept, not the same value elsewhere', async () => {
    const docs = [doc('a', `${report2024}\n备注：13912345678`)]
    const candidates = await findCandidates(docs, { profile })
    const decisions = initialDecisions(candidates)
    const [first, second] = candidates.filter((c) => c.value === '13912345678')
    decisions[first.id] = 'keep'
    decisions[second.id] = 'keep'
    const { book, codeFor } = assignCodes(candidates, decisions, profile, 'zh')
    // Neither spot was decided by hand: both are leftovers.
    const unreviewed = buildShareText(docs, applyCodes(docs, candidates, codeFor), 'zh')
    expect(checkResidue(unreviewed, book, profile)).toHaveLength(2)
    // Only the spot the user kept is exempt.
    const share = buildShareText(docs, applyCodes(docs, candidates, codeFor, new Set([first.id])), 'zh')
    const hits = checkResidue(share, book, profile)
    expect(hits).toHaveLength(1)
    expect(sourceOf(share, hits[0].start, hits[0].end)).toMatchObject({ start: second.start, end: second.end })
  })

  it('keeps every other code unchanged when one value is kept', async () => {
    const docs = [doc('a', '联系电话：13912345678\n家属电话：13700001111')]
    const candidates = await findCandidates(docs, { profile: empty })
    const decisions = initialDecisions(candidates)
    const before = assignCodes(candidates, decisions, empty, 'zh').codeFor
    const [first, second] = candidates
    expect([before[first.id], before[second.id]]).toEqual(['电话1', '电话2'])
    const after = assignCodes(candidates, { ...decisions, [first.id]: 'keep' }, empty, 'zh').codeFor
    expect(after[first.id]).toBeUndefined()
    expect(after[second.id]).toBe('电话2')
  })

  it('gives one number one code whether My info or a rule found it', async () => {
    const docs = [doc('a', 'TEL13912345678\n联系电话：13912345678')]
    const { share } = await run(docs, profile)
    expect(share.text.match(/电话1/g)).toHaveLength(2)
    expect(share.text).not.toContain('电话2')
  })

  it('stays fast on a long run of letters with no @', () => {
    const text = `备注：${'a'.repeat(100_000)}`
    const started = performance.now()
    detectRules(doc('a', text))
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('maps a spot in the shareable text back to the original page', async () => {
    const docs = [doc('a', '联系电话：13912345678\n快递单：TEL13912345678')]
    const { share } = await run(docs, empty)
    const at = share.text.indexOf('TEL')
    expect(sourceOf(share, at, at + 3)).toEqual({ docId: 'a', page: 1, start: docs[0].pages[0].text.indexOf('TEL'), end: docs[0].pages[0].text.indexOf('TEL') + 3 })
    const code = share.text.indexOf('电话1')
    expect(sourceOf(share, code, code + 3)).toBeNull()
  })
})

describe('restore', () => {
  it('puts originals back, tolerates a space in the code, and flags codes we never issued', async () => {
    const docs = [doc('a', report2025)]
    const candidates = await findCandidates(docs, { profile })
    const { book } = assignCodes(candidates, initialDecisions(candidates), profile, 'zh')
    const answer = '患者A 的总胆固醇偏高，建议患者 A 三个月后复查。家人B 也可以一起查。患者C 的数据没有出现。电话10 不是我们的代号。'
    const result = restoreAnswer(answer, book, 'zh')
    expect(result.text).toContain('张伟 的总胆固醇偏高，建议张伟 三个月后复查。王丽华 也可以一起查。')
    expect(result.replaced).toBe(3)
    expect(result.unknownCodes).toEqual(['患者C', '电话10'])
    expect(result.text).toContain('患者C')
  })

  it('leaves ordinary Chinese words alone and accepts full-width spacing', async () => {
    const book = { entries: [
      { code: '患者A', category: 'name' as const, display: '张伟', values: ['张伟'] },
      { code: '电话1', category: 'phone' as const, display: '13912345678', values: ['13912345678'] },
    ] }
    const result = restoreAnswer('患者A型血，患者\u3000A 和 患者Ａ 都是同一人。电话1号楼不是电话，电话1 才是。', book, 'zh')
    expect(result.text).toBe('患者A型血，张伟 和 张伟 都是同一人。电话1号楼不是电话，13912345678 才是。')
    expect(result.unknownCodes).toEqual([])
  })

  it('does not treat ordinary English words as codes', () => {
    const result = restoreAnswer('The patient a few days ago felt fine. Patient-A is stable.',
      { entries: [{ code: 'Patient-A', category: 'name', display: 'Zhang Wei', values: ['Zhang Wei'] }] }, 'en')
    expect(result.text).toBe('The patient a few days ago felt fine. Zhang Wei is stable.')
    expect(result.unknownCodes).toEqual([])
  })
})

describe('codes after copying', () => {
  const phones = (text: string) => [doc('a', text)]

  it('keeps codes the AI already saw when a new value appears earlier in the text', async () => {
    const before = await findCandidates(phones('联系电话：13912345678\n家属电话：13700001111'), { profile: empty })
    const frozen = assignCodes(before, initialDecisions(before), empty, 'zh').book
    expect(frozen.entries.map((entry) => entry.code)).toEqual(['电话1', '电话2'])
    // After copying, "My info" adds a number that sits in front of both.
    const later = await findCandidates(phones('本人电话：13600002222\n联系电话：13912345678\n家属电话：13700001111'), { profile: empty })
    const { codeFor } = assignCodes(later, initialDecisions(later), empty, 'zh', seedOf(frozen))
    expect(later.map((c) => codeFor[c.id])).toEqual(['电话3', '电话1', '电话2'])
  })

  it('a second copy adds to the frozen list, so codes from the first copy still restore', () => {
    const first: CodeBook = { entries: [{ code: '电话1', identity: 'phone:13912345678', category: 'phone', display: '13912345678', values: ['13912345678'] }] }
    const second: CodeBook = { entries: [{ code: '电话2', identity: 'phone:13700001111', category: 'phone', display: '13700001111', values: ['13700001111'] }] }
    const merged = mergeBooks(first, second)
    expect(merged.entries.map((entry) => entry.code)).toEqual(['电话1', '电话2'])
    expect(restoreAnswer('电话1 和 电话2', merged, 'zh').text).toBe('13912345678 和 13700001111')
  })
})

describe('restore choices', () => {
  const book: CodeBook = { entries: [
    { code: '患者A', identity: 'person:me', category: 'name', display: '张伟', values: ['张伟'] },
    { code: '电话1', identity: 'phone:13912345678', category: 'phone', display: '13912345678', values: ['13912345678'] },
  ] }

  it('marks codes that read like ordinary words instead of changing them silently', () => {
    const result = restoreAnswer('患者A型血，请打电话1次确认；患者A 已复查。', book, 'zh')
    expect(result.text).toBe('患者A型血，请打电话1次确认；张伟 已复查。')
    expect(result.ambiguous).toBe(2)
    expect(result.replaced).toBe(1)
    const ambiguous = result.segments.flatMap((segment, index) => (segment.ambiguous ? [index] : []))
    // The user can switch an ambiguous spot on, and a restored one back off.
    const restoredIndex = result.segments.findIndex((segment) => segment.restored)
    expect(restoredText(result, new Set([ambiguous[0], restoredIndex]))).toBe('张伟型血，请打电话1次确认；患者A 已复查。')
  })

  it('reads traditional prefixes and reports codes never issued', () => {
    const result = restoreAnswer('電話1 是對的，電話9 不是。', book, 'zh')
    expect(result.text).toBe('13912345678 是對的，電話9 不是。')
    expect(result.unknownCodes).toEqual(['電話9'])
  })
})

// A fixed pseudo-random sequence, so the sweeps below are the same on every run.
const sequence = (start: number) => {
  let seed = start
  return (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
}
const luhnDigit = (body: string) => {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    let digit = Number(body[body.length - 1 - i])
    if (i % 2 === 0) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return String((10 - (sum % 10)) % 10)
}

describe('matching edge cases', () => {
  it('finds a number with zero-width characters or odd spaces inside', async () => {
    const docs = [doc('a', '联系电话：13912345678\n备注：139\u200b1234\u200b5678 与 139\u00a01234\u00a05678')]
    const { share, book } = await run(docs, empty)
    expect(share.text.match(/电话1/g)).toHaveLength(3)
    expect(checkResidue(share, book, empty)).toEqual([])
  })

  it('normalizes without moving any character', () => {
    const text = '１３９\u200b１２３４\u3000５６７８\u2014'
    expect(normalizeText(text)).toHaveLength(text.length)
    expect(normalizeText(text)).toBe('139 1234 5678-')
  })

  it('finds record numbers in any OCR grouping, but never takes a date for one', async () => {
    expect(findValue('编号 20250815', 'record_number', '20250815')).toHaveLength(1)
    expect(findValue('复查日期 2025-08-15', 'record_number', '20250815')).toEqual([])
    expect(findValue('复查 2025.8.15', 'record_number', '2025815')).toEqual([])
    const { share, book } = await run([doc('a', '病历号：37465821\n复印件条码 3746 5821\n住院号：2025081501\n腕带 2025 0815 01\n病历号：20250815\n复查日期 2025-08-15')], empty)
    expect(share.text).not.toMatch(/3746|2025 0815 01/)
    expect(share.text).toContain('复查日期 2025-08-15')
    expect(checkResidue(share, book, empty)).toEqual([])
  })

  it('matches a landline with +86 or as a bare local number, but not inside a longer number', async () => {
    const me: Profile = { people: [{ id: 'me', role: 'self', phone: '0571-88881234' }] }
    const docs = [doc('a', '座机：+86 571 8888 1234\n分机：88881234\n订单：1888812345')]
    const candidates = await findCandidates(docs, { profile: me })
    expect(candidates.filter((c) => c.category === 'phone').map((c) => c.value)).toEqual(['+86 571 8888 1234', '88881234'])
  })

  it('finds a name next to a signature label and keeps an address apart from the phone after it', async () => {
    const docs = [doc('a', '患者签名：赵小明\n住址：杭州市西湖区文三路100号 电话：13912345678')]
    const candidates = await findCandidates(docs, { profile: empty })
    expect(byValue(candidates, '赵小明')?.category).toBe('name')
    const address = candidates.find((c) => c.category === 'address') as Candidate
    expect(address.value).not.toContain('电话')
    expect(byValue(candidates, '13912345678')?.category).toBe('phone')
  })

  it('finds insurance and record numbers again as written, with spaces or dashes', async () => {
    const docs = [doc('a', '医保号：3301 0619 9001 01\n病历号：MR-2024-0815\n备注：复诊请携带 3301-0619-9001-01 卡，报告 MR-2024-0815 已出。日期 2024-08-15')]
    const { share, book } = await run(docs, empty)
    expect(share.text).not.toMatch(/3301|MR-2024/)
    expect(share.text).toContain('日期 2024-08-15')
    expect(checkResidue(share, book, empty)).toEqual([])
    const me: Profile = { people: [{ id: 'me', role: 'self', socialSecurity: '3301 0619 9001 01' }] }
    const candidates = await findCandidates([doc('b', '参保人卡号 3301 0619 9001 01')], { profile: me })
    expect(candidates.map((c) => [c.category, c.value])).toEqual([['social_security', '3301 0619 9001 01']])
  })

  it('finds a card number followed by an amount or a date', async () => {
    const docs = [doc('a', '卡号：6222 0000 1111 2223\n转账 6222 0000 1111 2223 100.00 元\n还款 6222000011112223 2025-08-15')]
    const { share, book } = await run(docs, empty)
    expect(share.text).toContain('转账 银行卡1 100.00 元')
    expect(share.text).toContain('还款 银行卡1 2025-08-15')
    expect(checkResidue(share, book, empty)).toEqual([])
    // Without any label the rules still find the card inside the longer run.
    const alone = await findCandidates([doc('b', '转账 6222 0000 1111 2223 100.00 元')], { profile: empty })
    expect(alone.map((c) => [c.category, c.value])).toEqual([['bank_card', '6222 0000 1111 2223']])
  })

  it('does not end an address at words that only contain tel or 电话', async () => {
    for (const address of ['Hotel Road 12, Singapore', '12 Telok Ayer Street', '电话局宿舍3栋201']) {
      const candidates = await findCandidates([doc('a', `住址：${address}`)], { profile: empty })
      expect(candidates.find((c) => c.category === 'address')?.value).toBe(address)
    }
    const cut = await findCandidates([doc('b', '住址：Orchard Road 12 Tel: 6123 4567')], { profile: empty })
    expect(cut.find((c) => c.category === 'address')?.value).toBe('Orchard Road 12')
  })

  it('never takes lab values or lists of dates for a card number', async () => {
    // A fixed pseudo-random sequence, so the test is the same on every run.
    let seed = 20261020
    const next = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
    const decimal = () => `${next(300)}.${next(100)}`
    const rows: string[] = []
    for (let i = 0; i < 300; i++) rows.push(`血常规 ${Array.from({ length: 8 }, decimal).join(' ')}`)
    for (let i = 0; i < 300; i++) {
      rows.push(`复查日期 ${Array.from({ length: 4 }, () => `20${20 + next(9)}.${String(1 + next(12)).padStart(2, '0')}.${String(1 + next(28)).padStart(2, '0')}`).join(' ')}`)
    }
    const candidates = await findCandidates([doc('a', rows.join('\n'))], { profile: empty })
    expect(candidates.filter((c) => c.category === 'bank_card')).toEqual([])
  })

  it('finds a record number again in a different grouping, and My info numbers printed with spaces', async () => {
    const { share, book } = await run([doc('a', '体检编号：TJ20250001\n条码 TJ-2025-0001')], empty)
    expect(share.text).toBe('【文件 1】\n体检编号：编号1\n条码 编号1')
    expect(checkResidue(share, book, empty)).toEqual([])
    const me: Profile = { people: [{ id: 'me', role: 'self', socialSecurity: '330106199001' }] }
    const found = await findCandidates([doc('b', '社保 3301 0619 9001')], { profile: me })
    expect(found.map((c) => [c.category, c.value])).toEqual([['social_security', '3301 0619 9001']])
  })

  it('replaces all 19 digits of a card followed by an amount', async () => {
    // 6222000011112009 and 6222000011112009106 both pass the checksum (invented numbers).
    const candidates = await findCandidates([doc('a', '银行卡号：6222 0000 1111 2009 106 100.00元')], { profile: empty })
    expect(candidates.filter((c) => c.category === 'bank_card').map((c) => c.value)).toEqual(['6222 0000 1111 2009 106'])
  })

  it('ends an address before the phone label, without leftover label words or commas', async () => {
    for (const tail of [' 联系电话13912345678', ' 手机号13912345678', '，电话13912345678', ' 电话号码0571-88881234', ' 座机0571-88881234']) {
      const docs = [doc('a', `住址：杭州市西湖区文三路100号${tail}\n家住杭州市西湖区文三路100号。`)]
      const { share, candidates } = await run(docs, empty)
      expect(candidates.find((c) => c.category === 'address')?.value).toBe('杭州市西湖区文三路100号')
      expect(share.text).toContain('家住地址1。')
    }
  })

  it('finds an ID under its label in any grouping', async () => {
    for (const written of ['1101 0519 4912 3100 2X', '110105 1949 1231 002X']) {
      const candidates = await findCandidates([doc('a', `身份证号：${written}`)], { profile: empty })
      expect(candidates.map((c) => [c.category, c.value])).toContainEqual(['id_number', written])
    }
  })

  it('never takes blood-pressure logs or stay ranges for a card number', async () => {
    let seed = 7
    const next = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
    const day = () => `20${20 + next(9)}-${String(1 + next(12)).padStart(2, '0')}-${String(1 + next(28)).padStart(2, '0')}`
    const rows: string[] = []
    for (let i = 0; i < 200; i++) rows.push(`${day()}  ${100 + next(60)}  ${60 + next(40)}  ${60 + next(40)}  ${90 + next(10)}`)
    for (let i = 0; i < 200; i++) rows.push(`住院时间：${day()}\u2014${day()}`)
    const candidates = await findCandidates([doc('a', rows.join('\n'))], { profile: empty })
    expect(candidates.filter((c) => c.category === 'bank_card')).toEqual([])
  })

  it('keeps an address inside a long paragraph, and only the address', async () => {
    const history = '既往体健，否认高血压、糖尿病史，否认手术外伤史，'.repeat(12)
    const text = `患者李明，男，45岁，汉族，现住址：浙江省杭州市西湖区文三路100号2幢301室，因“胸痛3天，加重6小时”于2025年8月15日入院。${history}`
    const { share, candidates } = await run([doc('a', text)], empty)
    expect(candidates.find((c) => c.category === 'address')?.value).toBe('浙江省杭州市西湖区文三路100号2幢301室')
    expect(share.text).toContain('现住址：地址1，因“胸痛3天')
  })

  it('keeps English street names that contain Mobile, Phone or Email', async () => {
    for (const address of ['12 Mobile Street, Springfield', '3 Phone Plaza', '8 Email Lane']) {
      const candidates = await findCandidates([doc('a', `住址：${address}`)], { profile: empty })
      expect(candidates.find((c) => c.category === 'address')?.value).toBe(address)
    }
  })

  it('finds an ID in any grouping, also in an OCR row without colons', async () => {
    const candidates = await findCandidates([doc('a', '姓名  王小红  身份证号  1101 0519 4912 3100 2X  性别  女')], { profile: empty })
    expect(candidates.map((c) => [c.category, c.value])).toContainEqual(['id_number', '1101 0519 4912 3100 2X'])
  })

  it('replaces a whole card run under its label, even with a stray group in front', async () => {
    const { share } = await run([doc('a', '退款至银行卡号：0102 6222 0000 1111 2223')], empty)
    expect(share.text).toBe('【文件 1】\n退款至银行卡号：银行卡1')
  })

  it('keeps commas inside an address, and still ends it at the next clause', async () => {
    for (const address of ['北京，朝阳区建国路88号院3号楼', '浙江省杭州市西湖区，文三路100号3幢301室', '江苏省南京市, 鼓楼区中山北路200号']) {
      const { share, candidates } = await run([doc('a', `住址：${address}，因胸痛入院。`)], empty)
      expect(candidates.find((c) => c.category === 'address')?.value).toBe(address)
      expect(share.text).toContain('住址：地址1，因胸痛入院。')
    }
  })

  it('finds unlabelled cards with any OCR spacing', async () => {
    const next = sequence(11)
    const leaks: string[] = []
    for (let i = 0; i < 300; i++) {
      let body = '6222'
      const length = i % 2 === 0 ? 15 : 18
      while (body.length < length) body += String(next(10))
      const card = body + luhnDigit(body)
      let written = ''
      for (let k = 0; k < card.length; k++) written += (k > 0 && next(5) === 0 ? ' ' : '') + card[k]
      const { share } = await run([doc('a', `退款账户 ${written} 已处理`)], empty)
      if (/\d{2}/.test(share.text.replace(/\s/g, '').replace(/【文件1】/, ''))) leaks.push(written)
    }
    expect(leaks).toEqual([])
  })

  it('finds a grouped ID behind a short number such as an age or a bed', async () => {
    for (const text of ['张伟 男 45 1101 0519 4912 3100 2X 已登记', '床位 1203 110105 19491231 002X', '第3 110105 19491231 002X']) {
      const candidates = await findCandidates([doc('a', text)], { profile: empty })
      expect(candidates.find((c) => c.category === 'id_number')?.value.replace(/\s/g, '')).toBe('11010519491231002X')
    }
  })

  it('takes record numbers with letters or a fourth group for numbers, not dates', async () => {
    const { share, book } = await run([doc('a', '体检编号：TJ20250815\n复印件 TJ 2025 08 15\n条码 TJ-2025-08-15\n住院号：2025081503\n腕带 2025-08-15-03')], empty)
    expect(share.text).not.toMatch(/2025/)
    expect(checkResidue(share, book, empty)).toEqual([])
  })

  it('never takes date lists, sample stamps or amount lists for IDs, phones or cards', async () => {
    const next = sequence(23)
    const year = new Date().getFullYear()
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = (from: number) => `${from + next(3)}-${pad(1 + next(12))}-${pad(1 + next(28))}`
    const rows: string[] = []
    for (let i = 0; i < 1000; i++) rows.push(`随访日期：${day(2018)} ${day(2018)} ${day(2018)} ${day(2018)}`)
    for (let i = 0; i < 1000; i++) {
      const sample = String(100000 + next(900000))
      rows.push(`标本号 ${sample} ${year - next(2)}${pad(1 + next(12))}${pad(1 + next(28))} ${pad(next(24))}${pad(next(60))}`)
    }
    for (let i = 0; i < 500; i++) rows.push(`24小时出入量：入 ${100 + next(900)}, ${1000 + next(9000)}, ${1000 + next(9000)} ml`)
    for (let i = 0; i < 500; i++) rows.push(`尿量（ml）${100 + next(900)}/${1000 + next(9000)}/${1000 + next(9000)}`)
    for (let i = 0; i < 1000; i++) rows.push(`生化 ${Array.from({ length: 8 }, () => String(next(300))).join(' ')}`)
    const candidates = await findCandidates([doc('a', rows.join('\n'))], { profile: empty })
    expect(candidates.filter((c) => ['id_number', 'phone', 'bank_card'].includes(c.category)).map((c) => c.value)).toEqual([])
  })

  it('finds a landline right after a mobile or another number', async () => {
    for (const [text, landline] of [
      ['联系电话：13912345678 021-62345678', '021-62345678'],
      ['紧急联系人：王芳 13812345678 0571-88881234', '0571-88881234'],
      ['电话：010-62579605 010-87995753', '010-87995753'],
      ['床号 12 0571-88881234', '0571-88881234'],
      ['家属电话 +86 010-62345678', '010-62345678'],
    ]) {
      const candidates = await findCandidates([doc('a', text)], { profile: empty })
      expect(candidates.filter((c) => c.category === 'phone').map((c) => c.value)).toContain(landline)
    }
  })

  it('never takes OCR rows of 4-digit lab values for cards', async () => {
    const next = sequence(31)
    const rows: string[] = []
    for (let i = 0; i < 1000; i++) rows.push(`NT-proBNP(pg/mL)  ${Array.from({ length: 4 + next(2) }, () => String(1000 + next(9000))).join('  ')}`)
    const candidates = await findCandidates([doc('a', rows.join('\n'))], { profile: empty })
    expect(candidates.filter((c) => c.category === 'bank_card')).toEqual([])
  })

  it('replaces names after relation words and instructions by default', async () => {
    const me: Profile = { people: [{ id: 'me', role: 'self', name: '张伟' }, { id: 'f', role: 'family', name: '李梅' }] }
    const candidates = await findCandidates([doc('a', '嘱张伟按时服药，其女儿李梅陪同，由丈夫张伟签字。')], { profile: me })
    expect(candidates.filter((c) => c.category === 'name').map((c) => [c.value, c.suggestion])).toEqual([
      ['张伟', 'replace'], ['李梅', 'replace'], ['张伟', 'replace'],
    ])
  })

  it('reports a known number found inside a longer one, without replacing it', async () => {
    const docs = [doc('a', '备注：139123456789')]
    const share = buildShareText(docs, applyCodes(docs, [], {}), 'zh')
    const book: CodeBook = { entries: [{ code: '电话1', identity: 'phone:13912345678', category: 'phone', display: '13912345678', values: ['13912345678'] }] }
    expect(checkResidue(share, book, empty).map((hit) => hit.value)).toEqual(['13912345678'])
  })

  it('reads label and value pairs between tabs', async () => {
    const candidates = await findCandidates([doc('a', '姓名：张伟\t性别：男\t年龄：45岁\n住院号：ZY2025001\t床号：12\n医保卡号：33010619900101')], { profile: empty })
    expect(candidates.map((c) => [c.category, c.value])).toEqual(expect.arrayContaining([
      ['name', '张伟'], ['record_number', 'ZY2025001'], ['social_security', '33010619900101'],
    ]))
  })

  it('finds names under a label that OCR split with a space, and long names with a dot', async () => {
    for (const [text, name] of [['姓名：张 伟  性别：男', '张 伟'], ['联系人：卢 国庆', '卢 国庆'], ['姓名：阿依古丽\u00b7买买提  性别：女', '阿依古丽\u00b7买买提']]) {
      const candidates = await findCandidates([doc('a', text)], { profile: empty })
      expect(candidates.find((c) => c.category === 'name')?.value).toBe(name)
    }
    // A lone gender after the space is not part of the name.
    const gender = await findCandidates([doc('b', '姓名：张伟 男')], { profile: empty })
    expect(gender.find((c) => c.category === 'name')?.value).toBe('张伟')
  })

  it('finds an ID number written in groups', async () => {
    const docs = [doc('a', `身份证：110105 19491231 002X`)]
    const candidates = await findCandidates(docs, { profile: empty })
    expect(candidates.map((c) => [c.category, c.value])).toContainEqual(['id_number', '110105 19491231 002X'])
  })
})

describe('line breaks, running text and country codes', () => {
  const pad = (n: number, width: number) => String(n).padStart(width, '0')
  const idFrom = (next: (n: number) => number) => {
    const body = ['110105', '310104', '440305', '330106', '510107'][next(5)] + (1940 + next(60)) + pad(1 + next(12), 2) + pad(1 + next(28), 2) + pad(1 + next(998), 3)
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    return body + '10X98765432'[weights.reduce((total, weight, i) => total + Number(body[i]) * weight, 0) % 11]
  }
  const mobileFrom = (next: (n: number) => number) => `1${3 + next(7)}${pad(next(1_000_000_000), 9)}`
  const cardFrom = (next: (n: number) => number, length: number) => {
    let body = '6222'
    while (body.length < length - 1) body += String(next(10))
    return body + luhnDigit(body)
  }
  /** The value with a line break somewhere between `from` and `to`, as narrow columns and OCR print it. */
  const breakIn = (next: (n: number) => number, value: string, from: number, to: number) => {
    const at = from + next(to - from + 1)
    return value.slice(0, at) + ['\n', ' \n', '\n '][next(3)] + value.slice(at)
  }
  const kinds = (candidates: Candidate[], ...categories: string[]) => candidates.filter((c) => categories.includes(c.category)).map((c) => c.value)

  it('finds IDs, phones and cards cut by a line break, with any OCR spacing', async () => {
    const next = sequence(41)
    const leaks: string[] = []
    for (let i = 0; i < 300; i++) {
      const id = idFrom(next)
      const grouped = next(2) === 0 ? id : `${id.slice(0, 6)} ${id.slice(6, 14)} ${id.slice(14)}`
      const card = cardFrom(next, next(2) === 0 ? 16 : 19).replace(/(\d{4})(?=\d)/g, '$1 ')
      const text = [
        `身份证号：${breakIn(next, grouped, 2, grouped.length - 2)}`,
        `${['联系电话：', '手机：', '患者电话'][next(3)]}${breakIn(next, mobileFrom(next), 2, 9)}`,
        `${['退款账户：', '余款已退至银行卡 '][next(2)]}${breakIn(next, card, 4, card.length - 3)}`,
        `电话：0${[21, 571, 755][next(3)]}-${breakIn(next, String(20_000_000 + next(70_000_000)), 1, 6)}`,
      ].join('\n')
      const { share, book } = await run([doc('a', text)], empty)
      // Codes carry one digit (证件1); two digits in a row are a leftover.
      if (/\d{2}/.test(share.text.replace(/\s/g, '')) || checkResidue(share, book, empty).length > 0) leaks.push(text)
    }
    expect(leaks).toEqual([])
  })

  it('never joins numbers on separate lines into a phone, ID or card', async () => {
    const next = sequence(43)
    const rows: string[] = []
    for (let i = 0; i < 300; i++) rows.push(`${1 + next(12)}\t${['白细胞', '血红蛋白', '血小板', '肌酐'][next(4)]}\t${100 + next(350)}\tg/L\t${100 + next(30)}-${150 + next(300)}`)
    for (let i = 0; i < 300; i++) rows.push(String(1000 + next(9000)))
    for (let i = 0; i < 300; i++) rows.push(`2025-${pad(1 + next(12), 2)}-${pad(1 + next(28), 2)}  ${100 + next(70)}  ${60 + next(40)}  ${55 + next(45)}`)
    for (let i = 0; i < 300; i++) rows.push(`钠(Na)  ${130 + next(20)}`, `20${20 + next(6)}${pad(1 + next(12), 2)}${pad(1 + next(28), 2)} ${pad(next(24), 2)}:${pad(next(60), 2)} 采样`)
    for (let i = 0; i < 300; i++) rows.push(`标本号 ${100_000 + next(900_000)}`, `2025${pad(1 + next(12), 2)}${pad(1 + next(28), 2)} ${pad(next(24), 2)}${pad(next(60), 2)}`)
    for (let i = 0; i < 300; i++) rows.push(`合计 ${1000 + next(9000)}.${pad(next(100), 2)}`, `${1000 + next(9000)}.${pad(next(100), 2)} 元`)
    // Phone words in a follow-up log, and a Platelet column: a systolic value and the next row's date are no phone.
    for (let i = 0; i < 300; i++) rows.push(`2025${pad(1 + next(12), 2)}${pad(1 + next(28), 2)} 电话随访，血压 ${130 + next(60)}`)
    for (let i = 0; i < 300; i++) rows.push(`2024${pad(1 + next(12), 2)}${pad(1 + next(28), 2)}  ${(4 + next(6)).toFixed(1)}   ${120 + next(30)}   Platelet ${150 + next(200)}`)
    for (let i = 0; i < 300; i++) rows.push(`邮编 ${100000 + next(800000)}`, `2022${pad(1 + next(12), 2)}${pad(1 + next(28), 2)}${pad(next(10000), 4)}  血常规`)
    const candidates = await findCandidates([doc('a', rows.join('\n'))], { profile: empty })
    expect(kinds(candidates, 'id_number', 'phone', 'bank_card')).toEqual([])
  })

  it('never takes the next line into a number that already ends its line', async () => {
    const next = sequence(53)
    for (let i = 0; i < 200; i++) {
      const card = cardFrom(next, next(2) === 0 ? 16 : 19).replace(/(\d{4})(?=\d)/g, '$1 ')
      const mobile = mobileFrom(next)
      const after = [`${100 + next(9000)}.00元`, `${1 + next(9)}、门诊费用`, `2025年${1 + next(12)}月${1 + next(28)}日复诊`, `${1 + next(30)}床`][next(4)]
      const text = `银行卡号：${card}\n${after}\n联系电话：${mobile.slice(0, 3)} ${mobile.slice(3, 7)} ${mobile.slice(7)}\n${after}\n电话：0898-${4_000_000 + next(5_000_000)}\n${after}`
      const { share } = await run([doc('a', text)], empty)
      expect(share.text).toBe(`【文件 1】\n银行卡号：银行卡1\n${after}\n联系电话：电话1\n${after}\n电话：电话2\n${after}`)
    }
  })

  it('carries a labelled address onto the next lines of a narrow column, and stops before the report goes on', async () => {
    const addresses = ['浙江省杭州市西湖区文三路100号2幢301室', '北京市朝阳区建国路88号院3号楼1201室', '江苏省南京市鼓楼区中山北路200号16-5-603', '四川省成都市武侯区学院路780号，阳光花园4号楼2单元1904室']
    const after = ['一、一般检查', '床号 12', '2. 血脂偏高，建议复查。', '3床 李明', '12号床', '第2次复查', '联系电话：13912345678', '入院诊断：高血压病2级', '身高 170 cm  体重 65.0 kg',
      '凭此单到12号窗口取报告', '3号楼2层 内分泌科门诊', '超声检查在门诊2楼进行', '21号染色体三体高风险', '3-4天前出现发热', '皮下2层缝合']
    let k = 0
    for (const address of addresses) {
      for (let at = Math.ceil(address.length / 2); at < address.length; at++) {
        const next = after[k++ % after.length]
        const { share, candidates } = await run([doc('a', `住址：${address.slice(0, at)}\n${address.slice(at)}\n${next}`)], empty)
        expect(candidates.find((c) => c.category === 'address')?.value.replace(/\s/g, '')).toBe(address)
        expect(share.text).toContain(next.replace('13912345678', '电话1'))
      }
    }
    // An address on one line never takes the line below it, nor a table cell the next row.
    for (const next of after) {
      const candidates = await findCandidates([doc('b', `住址：杭州市西湖区文三路100号\n${next}`)], { profile: empty })
      expect(candidates.find((c) => c.category === 'address')?.value).toBe('杭州市西湖区文三路100号')
    }
    // A label glued to the next line's address ends it there, not one character early.
    const glued = await findCandidates([doc('f', '住址：浙江省杭州市西湖区文三路100号\n2幢301室电话：13912345678')], { profile: empty })
    expect(kinds(glued, 'address', 'phone').map((value) => value.replace(/\s/g, ''))).toEqual(['浙江省杭州市西湖区文三路100号2幢301室', '13912345678'])
    // A sentence below that names its own address gets its own.
    const sentence = await findCandidates([doc('e', '住址：杭州市西湖区文三路100号\n患者居住于江苏省南京市鼓楼区中山路12号')], { profile: empty })
    expect(kinds(sentence, 'address')).toEqual(['杭州市西湖区文三路100号', '江苏省南京市鼓楼区中山路12号'])
    const table = await findCandidates([doc('c', '姓名\t性别\t住址\n张建国\t男\t3栋2单元501\n李秀英\t女\t5栋1单元302')], { profile: empty })
    expect(kinds(table, 'name', 'address')).toEqual(['张建国', '3栋2单元501', '李秀英', '5栋1单元302'])
    // Wrapped place names that start like a clause (无锡市, 于洪区) still carry on.
    for (const [first, second] of [['江苏省', '无锡市梁溪区中山路100号'], ['辽宁省沈阳市', '于洪区黄河北大街56号'], ['江苏省南京市', '鼓楼区中山北路\n100号']]) {
      const candidates = await findCandidates([doc('d', `住址：${first}\n${second}`)], { profile: empty })
      expect(candidates.find((c) => c.category === 'address')?.value.replace(/\s/g, '')).toBe(`${first}${second}`.replace(/\s/g, ''))
    }
  })

  it('finds addresses in running text after 家住, 现住, 住在 and 居住于, up to the end of the clause', async () => {
    const addresses = ['江苏省南京市鼓楼区香港中路746号', '北京市朝阳区建国路88号院3号楼1201室', '上海市浦东新区，张杨路500号', '广东省深圳市南山区科技园南路12号阳光花园3栋2201室']
    const words = ['家住', '现住', '住在', '居住于', '现居住于', '家庭住址为']
    const after = ['，因胸痛3天入院。', '。平素体健。', '，于2025年8月15日入院。', '，否认药物过敏史。', '，务农。', '，电话13912345678。']
    let k = 0
    for (const address of addresses) {
      for (const word of words) {
        const tail = after[k++ % after.length]
        const { share, candidates } = await run([doc('a', `患者李明，男，45岁，${word}${address}${tail}`)], empty)
        expect(candidates.find((c) => c.category === 'address')?.value).toBe(address)
        expect(share.text).toContain(`${word}地址1${tail.replace('13912345678', '电话1')}`)
      }
    }
  })

  it('never takes 现住院, 住在ICU or 家住农村 for an address, or 住在 for a name', async () => {
    const phrases = ['现住院第3天', '住在ICU期间', '住在重症监护室期间', '居住于本地多年', '家住农村', '居住环境良好', '现住院治疗中', '家住3楼，无电梯',
      '现住址不详', '居住在城市', '住在女儿家', '家住郊区', '住在市区', '居住于北方', '住在本院附近', '住在杭州市第一人民医院', '家住山区',
      '家住上海市浦东新区', '住在杭州市西湖区中医院期间曾输血', '住在浙江省人民医院5号楼', '居住在工业区和化工园区附近', '曾居住于湖北省武汉市3年',
      '家住3楼，无疫区接触史', '核对住址是否正确']
    for (const phrase of phrases) {
      const candidates = await findCandidates([doc('a', `患者${phrase}，自述头痛。病人${phrase}。`)], { profile: empty })
      expect(candidates.map((c) => [c.category, c.value])).toEqual([])
    }
  })

  it('ends an address in running text before labels, gaps, numbers and new clauses', async () => {
    const address = '江苏省南京市鼓楼区中山路12号'
    for (const tail of ['  职业：退休', ' 入院诊断：冠心病', '性别：男  年龄：67岁', '、无业', ' 因胸痛3天入院', ' 025-83123456', ' 139 1234 5678', ' 身份证320106196501011230',
      '，社区医院测血压170/100mmHg', '，发病前曾去湖北省武汉市出差', '，长期在本市打工', ' 血压150/90mmHg 心率88次/分', '  入院日期：2025-08-15  床号：12']) {
      const candidates = await findCandidates([doc('a', `家住${address}${tail}`)], { profile: empty })
      expect(candidates.find((c) => c.category === 'address')?.value).toBe(address)
    }
    // A trigger at the end of a line: the address is the next line, also when it is indented with a tab.
    for (const indent of ['', '\t', '  ']) {
      const wrapped = await findCandidates([doc('b', `患者，男，67岁，现居住于\n${indent}${address}，因胸痛入院。`)], { profile: empty })
      expect(wrapped.find((c) => c.category === 'address')?.value).toBe(address)
    }
  })

  it('stays fast on long lines of address words', () => {
    for (const text of ['家住农村，'.repeat(20000), '住在南京市鼓楼区中山路12号 '.repeat(3000), '1\n'.repeat(50000)]) {
      const started = performance.now()
      detectRules(doc('a', text))
      expect(performance.now() - started).toBeLessThan(1000)
    }
  })

  it('finds +86 landlines without the leading 0, and gives them the code of the same number with it', async () => {
    for (const written of ['+86-21-83134703', '+86 755 8312 3456', '+86 10 62345678', '(+86)21-62345678', '0086-571-88881234', '+8621-62345678', '+86 (21) 6234 5678']) {
      const candidates = await findCandidates([doc('a', `家属电话 ${written}，已告知。`)], { profile: empty })
      expect(kinds(candidates, 'phone')).toEqual([written])
    }
    const { share } = await run([doc('a', '联系电话：021-62345678\n家属电话 +86-21-62345678\n座机：+86 21 6234 5678\n备用：0086 21 6234 5678')], empty)
    expect(share.text).toBe('【文件 1】\n联系电话：电话1\n家属电话 电话1\n座机：电话1\n备用：电话1')
    expect(findValue('电话：0086 21 6234 5678', 'phone', '021-62345678')).toHaveLength(1)
    // A mobile after +86 is still a mobile; service lines, codes and an age before a mobile are no landline.
    expect(kinds(await findCandidates([doc('b', '电话：+86 139 1234 5678')], { profile: empty }), 'phone')).toEqual(['+86 139 1234 5678'])
    for (const text of ['预约请拨 +86 400 820 8820', '预约请拨 +86 (400) 820 8820', '条码 00862025081501', '总分(86) 25 1234 5678']) {
      expect(kinds(await findCandidates([doc('c', text)], { profile: empty }), 'phone')).toEqual([])
    }
    const ages = await run([doc('d', '姓名    性别    年龄    联系电话\n王芳    女    86    13912345678\n联系电话：(+86)13912345678')], empty)
    expect(ages.share.text).toBe('【文件 1】\n姓名    性别    年龄    联系电话\n患者A    女    86    电话1\n联系电话：(+86)电话1')
  })

  it('reads 参保号, and a record number before a label with words in front, but never a date or amount for one', async () => {
    const found = await findCandidates([doc('a', [
      '参保号：K12345678  参保类型：职工医保',
      '体检编号：TJ-2024-0815-0001  体检日期：2024-08-15',
      '病历号：12345678 门诊科室：内科',
      '门诊号：MZ20250815001  家属电话：13912345678',
      '参保日期：20240101  医保统筹支付：123456  参保地：杭州市',
      '首次参保年月：201507  参保区划代码：330106  累计参保月数：000120',
      '医保报销单号：BX2024051200123',
      '参保人：张三 370202194001285219',
      '住院号：ZY2024001234，入院日期：2024-05-01',
      '主治医生姓名：王强  家属姓名：李四',
    ].join('\n'))], { profile: empty })
    expect(found.map((c) => [c.category, c.value])).toEqual([
      ['social_security', 'K12345678'], ['record_number', 'TJ-2024-0815-0001'], ['record_number', '12345678'],
      ['record_number', 'MZ20250815001'], ['phone', '13912345678'], ['social_security', 'BX2024051200123'],
      ['name', '张三'], ['id_number', '370202194001285219'], ['record_number', 'ZY2024001234'], ['name', '王强'], ['name', '李四'],
    ])
    expect(found.filter((c) => c.category === 'name').map((c) => c.role)).toEqual(['patient', 'doctor', 'family'])
    // Words in front of a glued label after a gap are not a name (患者家庭电话), and an address keeps its last part.
    const glued = await findCandidates([doc('b', '住院号：ZY2024001234  患者家庭电话：0571-88886666\n家庭成员陪同。\n住址：河南省周口市太康县 王庄村电话：13912345678\n住址：南京市鼓楼区中山路1号 家属姓名：王五')], { profile: empty })
    expect(glued.map((c) => [c.category, c.value])).toEqual([
      ['record_number', 'ZY2024001234'], ['phone', '0571-88886666'], ['address', '河南省周口市太康县 王庄村'], ['phone', '13912345678'],
      ['address', '南京市鼓楼区中山路1号'], ['name', '王五'],
    ])
  })

  it('joins a labelled ID or phone cut by a line break, but never takes the next line of the report into a number', async () => {
    const found = await findCandidates([doc('a', '身份证号：3101041\n98710232464\n参保号：4403051970\n03012210  参保类型：职工医保\n联系电话：1334700\n6655')], { profile: empty })
    expect(found.map((c) => c.value.replace(/\s/g, ''))).toEqual(['310104198710232464', '440305197003012210', '13347006655'])
    // A record number can not be checked, so the next line stays its own: a date, a bed, a lab value, a table row.
    for (const next of ['2. 血脂偏高', '2025-08-15', '20240115', '12床', '1', '577  mmol/L', '120 mmHg', '102  李娜  1002346', '7917']) {
      const candidates = await findCandidates([doc('b', `住院号：1002345\n${next}`)], { profile: empty })
      expect(candidates.filter((c) => c.category === 'record_number').map((c) => c.value)).toEqual(['1002345'])
    }
    for (const next of ['2', '20240108', '102  李娜']) {
      const candidates = await findCandidates([doc('c', `联系电话：88886666\n${next}`)], { profile: empty })
      expect(candidates.filter((c) => c.category === 'phone').map((c) => c.value)).toEqual(['88886666'])
    }
  })

  it('asks about the digits under a replaced number when a line break cut it where nothing joined them', async () => {
    const { share, book } = await run([doc('a', '参保号：SH6112\n383182\n住院号：1002345\n20240115')], empty)
    expect(share.text).toBe('【文件 1】\n参保号：社保号1\n383182\n住院号：编号1\n20240115')
    expect(checkResidue(share, book, empty).map((hit) => [hit.kind, hit.value])).toEqual([['unreviewed', '383182']])
    // A line that goes on after its digits is not the rest of a number.
    const amounts = await run([doc('b', '参保号：SH6112\n1234 5678 9012 3456 7890 1234 5678 9012 3456 元 合计')], empty)
    expect(checkResidue(amounts.share, amounts.book, empty)).toEqual([])
  })

  it('never takes rows of 4-digit lab values with single spaces or tabs for cards', async () => {
    const next = sequence(47)
    const rows: string[] = []
    for (let i = 0; i < 1000; i++) {
      const values = Array.from({ length: 4 + next(2) }, () => String(1000 + next(9000)))
      rows.push(`${['NT-proBNP(pg/mL)', '24h尿量(mL)', 'D-二聚体'][next(3)]}${i % 2 === 0 ? ' ' : '\t'}${values.join(i % 2 === 0 ? ' ' : '\t')}`)
    }
    const candidates = await findCandidates([doc('a', rows.join('\n'))], { profile: empty })
    expect(kinds(candidates, 'bank_card')).toEqual([])
    // A card still counts with payment words, or alone on its line under a label on the line before.
    for (const text of ['退款账户 6222 0000 1111 2223', '银行卡号：\n6222 0000 1111 2223', '6222 0000 1111 2223', '退费至6222 0000 1111 2223',
      '6222 0000 1111 2223(储蓄卡)', '患者家属提供：6222 0000 1111 2223（中国农业银行）', '退至其本人名下 6222 0000 1111 2223']) {
      expect(kinds(await findCandidates([doc('b', text)], { profile: empty }), 'bank_card')).toEqual(['6222 0000 1111 2223'])
    }
  })

  it('replaces the whole value where the rules took only part of a value found in full elsewhere', async () => {
    const { share } = await run([doc('a', [
      '住址：四川省成都市锦江区文三路188号，电力局宿舍29号楼2单元602室',
      '患者居住于四川省成都市锦江区文三路188号，电力局宿舍2  9号楼2单元602室，否认药物过敏史。',
    ].join('\n'))], empty)
    expect(share.text).toBe('【文件 1】\n住址：地址1\n患者居住于地址1，否认药物过敏史。')
  })
})

describe('pluggable detection', () => {
  it('accepts an extra detector and a reviewer without losing rule findings', async () => {
    const text = '家属：王丽华\n备注：请联系赵小明'
    const model: Detector = {
      id: 'fake-model',
      detect: (d) => {
        const start = text.indexOf('赵小明')
        return [{ docId: d.id, page: 1, start, end: start + 3, category: 'name', source: 'model', certainty: 'unsure', reason: 'model', suggestion: 'replace' }]
      },
    }
    const candidates = await findCandidates([doc('a', text)], { profile: empty }, {
      detectors: [model, ...(await import('../shared/redact')).defaultDetectors()],
      reviewer: {
        id: 'fake-reviewer',
        review: async (items) => items.filter((c) => c.value === '王丽华').map((c) => ({ id: c.id, certainty: 'sure' as const })),
      },
    })
    expect(candidates.map((c) => [c.value, c.source, c.certainty])).toEqual([
      ['王丽华', 'label', 'sure'],
      ['赵小明', 'model', 'unsure'],
    ])
  })
})
