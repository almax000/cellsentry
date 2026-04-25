import { describe, it, expect } from 'vitest'
import {
  CN_MEDICAL_PATTERNS,
  CnPiiType,
  cnIdChecksum,
  luhnCheck,
} from './patterns'

describe('cnIdChecksum', () => {
  it('accepts a valid 18-digit ID', () => {
    // Synthetic but checksum-valid example
    expect(cnIdChecksum('11010519491231002X')).toBe(true)
  })
  it('rejects wrong length', () => {
    expect(cnIdChecksum('110105194912310')).toBe(false)
  })
  it('rejects bad checksum', () => {
    expect(cnIdChecksum('110105194912310020')).toBe(false)
  })
  it('rejects non-digit body', () => {
    expect(cnIdChecksum('11010519491231ABCX')).toBe(false)
  })
})

describe('luhnCheck', () => {
  it('accepts a known-valid Visa-style number', () => {
    expect(luhnCheck('4532015112830366')).toBe(true)
  })
  it('rejects too-short input', () => {
    expect(luhnCheck('12345')).toBe(false)
  })
  it('rejects too-long input', () => {
    expect(luhnCheck('1234567890123456789012')).toBe(false)
  })
})

describe('CN_MEDICAL_PATTERNS', () => {
  function findType(text: string, type: CnPiiType): RegExpMatchArray | null {
    const p = CN_MEDICAL_PATTERNS.find((x) => x.type === type)!
    p.regex.lastIndex = 0
    return text.match(p.regex)
  }

  it('detects mobile number in context', () => {
    const m = findType('联系人 13812345678 张三', CnPiiType.MOBILE)
    expect(m).not.toBeNull()
    expect(m![0]).toBe('13812345678')
  })
  it('does not match invalid mobile prefix', () => {
    const m = findType('编号 12345678901', CnPiiType.MOBILE)
    expect(m).toBeNull()
  })
  it('detects email', () => {
    const m = findType('email: a.b+test@example.co.cn', CnPiiType.EMAIL)
    expect(m).not.toBeNull()
  })
  it('detects 病历号 with separator variants', () => {
    const m1 = findType('病历号: ABC-12345', CnPiiType.MEDICAL_RECORD)
    expect(m1).not.toBeNull()
    const m2 = findType('病历号：XYZ12345', CnPiiType.MEDICAL_RECORD)
    expect(m2).not.toBeNull()
  })
  it('detects 医保号', () => {
    const m = findType('医保卡号 110105-1949', CnPiiType.INSURANCE)
    expect(m).not.toBeNull()
  })
  it('detects 就诊号', () => {
    const m = findType('就诊号: 20240315001', CnPiiType.VISIT)
    expect(m).not.toBeNull()
  })
})
