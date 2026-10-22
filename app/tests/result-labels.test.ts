import { describe, expect, it } from 'vitest'
import { PII_PATTERNS } from '../electron/pii/patterns'
import { EXTRACTION_TEMPLATES } from '../electron/extraction/templates'
import { piiLabelKey } from '../src/utils/piiLabel'
import zhPii from '../src/i18n/locales/zh/pii.json'
import enPii from '../src/i18n/locales/en/pii.json'
import zhExtraction from '../src/i18n/locales/zh/extraction.json'
import enExtraction from '../src/i18n/locales/en/extraction.json'

function lookup(resource: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], resource)
}

describe('PII type labels', () => {
  it('has a zh and en label for every pattern the scanner can report', () => {
    for (const pattern of PII_PATTERNS) {
      const key = piiLabelKey(pattern.type as never, pattern.label)
      expect(lookup(zhPii, key), `zh ${key}`).toEqual(expect.any(String))
      expect(lookup(enPii, key), `en ${key}`).toEqual(expect.any(String))
    }
  })

  it('tells US and Chinese phone numbers apart and names the SSN correctly', () => {
    expect(lookup(zhPii, piiLabelKey('phone', 'Chinese mobile number'))).toBe('手机号')
    expect(lookup(zhPii, piiLabelKey('phone', 'US phone number'))).toBe('美国电话号码')
    expect(lookup(zhPii, piiLabelKey('ssn', 'US SSN (dashed)'))).toBe('美国社会安全号（SSN）')
    expect(lookup(zhPii, piiLabelKey('phone', 'ai-detected'))).toBe('电话号码')
  })
})

describe('extraction field labels', () => {
  it('translates every field key the built-in templates can produce', () => {
    for (const template of EXTRACTION_TEMPLATES) {
      for (const field of template.fieldPatterns) {
        expect(lookup(zhExtraction, `fieldLabels.${field.key}`), `zh ${field.key}`).toEqual(expect.any(String))
        expect(lookup(enExtraction, `fieldLabels.${field.key}`), `en ${field.key}`).toEqual(expect.any(String))
      }
    }
  })
})
