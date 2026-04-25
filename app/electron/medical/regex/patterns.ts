/**
 * Regex patterns + validators for Chinese medical document PII.
 *
 * Migrated from v1.x `electron/pii/patterns.ts` (CN section retained;
 * universal/US/EU patterns dropped — v2 scope is Chinese medical only).
 *
 * Each pattern includes an optional validator for post-match verification
 * (Luhn for bank cards, GB 11643-1999 checksum for Chinese ID).
 */

export enum CnPiiType {
  ID_CARD = 'id_card', // 身份证
  MOBILE = 'mobile', // 手机号
  EMAIL = 'email', // 邮箱
  BANK_CARD = 'bank_card', // 银行卡
  MEDICAL_RECORD = 'medical_record', // 病历号
  INSURANCE = 'insurance', // 医保号
  VISIT = 'visit', // 就诊号
}

export interface CnPattern {
  type: CnPiiType
  regex: RegExp
  label: string
  validator?: (match: string) => boolean
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** Luhn algorithm — validates credit card and bank card numbers. */
export function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '')
  if (digits.length < 12 || digits.length > 19) return false

  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

/** Chinese 18-digit ID card checksum (GB 11643-1999). */
export function cnIdChecksum(id: string): boolean {
  const cleaned = id.replace(/\s/g, '')
  if (cleaned.length !== 18) return false

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkCodes = '10X98765432'

  let sum = 0
  for (let i = 0; i < 17; i++) {
    const digit = parseInt(cleaned[i], 10)
    if (isNaN(digit)) return false
    sum += digit * weights[i]
  }

  const expected = checkCodes[sum % 11]
  return cleaned[17].toUpperCase() === expected
}

function luhnBankCard(match: string): boolean {
  const digits = match.replace(/\D/g, '')
  if (digits.length < 16 || digits.length > 19) return false
  return luhnCheck(digits)
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export const CN_MEDICAL_PATTERNS: CnPattern[] = [
  {
    type: CnPiiType.ID_CARD,
    regex: /(?<!\d)\d{17}[\dXx](?!\d)/g,
    label: 'Chinese ID number (18-digit)',
    validator: cnIdChecksum,
  },
  {
    type: CnPiiType.MOBILE,
    regex: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    label: 'Chinese mobile number',
  },
  {
    type: CnPiiType.EMAIL,
    regex: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,
    label: 'Email address',
  },
  {
    type: CnPiiType.BANK_CARD,
    regex: /(?<!\d)\d{16,19}(?!\d)/g,
    label: 'Bank card number',
    validator: luhnBankCard,
  },
  // Hospital-specific identifiers — patterns are placeholders to be refined
  // against real hospital report samples in W2-W3.
  {
    type: CnPiiType.MEDICAL_RECORD,
    regex: /病历号[:：\s]*([A-Z0-9-]{6,20})/g,
    label: 'Medical record number (病历号)',
  },
  {
    type: CnPiiType.INSURANCE,
    regex: /医保(?:卡)?号[:：\s]*([A-Z0-9-]{6,20})/g,
    label: 'Health insurance number (医保号)',
  },
  {
    type: CnPiiType.VISIT,
    regex: /就诊号[:：\s]*([A-Z0-9-]{6,20})/g,
    label: 'Visit number (就诊号)',
  },
]
