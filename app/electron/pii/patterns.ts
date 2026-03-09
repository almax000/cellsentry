/**
 * PII regex patterns organized by locale.
 *
 * Each pattern includes an optional validator for post-match verification
 * (e.g. Luhn check for credit cards, checksum for Chinese ID numbers).
 */

import { PiiType } from './types'
import type { PiiPattern } from './types'

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

// ---------------------------------------------------------------------------
// Helpers for Luhn-based validators bound to specific digit ranges
// ---------------------------------------------------------------------------

function luhnCreditCard(match: string): boolean {
  const digits = match.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  return luhnCheck(digits)
}

function luhnBankCard(match: string): boolean {
  const digits = match.replace(/\D/g, '')
  if (digits.length < 16 || digits.length > 19) return false
  return luhnCheck(digits)
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export const PII_PATTERNS: PiiPattern[] = [
  // ── Universal ──────────────────────────────────────────────────────────

  {
    type: PiiType.EMAIL,
    regex: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/,
    locale: 'universal',
    label: 'Email address',
  },
  {
    type: PiiType.CREDIT_CARD,
    regex: /\b(?:\d[ -]*?){13,19}\b/,
    locale: 'universal',
    label: 'Credit card number',
    validator: luhnCreditCard,
  },
  {
    type: PiiType.IBAN,
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/,
    locale: 'universal',
    label: 'IBAN',
  },

  // ── CN (China) ─────────────────────────────────────────────────────────

  {
    type: PiiType.ID_NUMBER,
    regex: /(?<!\d)\d{17}[\dXx](?!\d)/,
    locale: 'cn',
    label: 'Chinese ID number (18-digit)',
    validator: cnIdChecksum,
  },
  {
    type: PiiType.PHONE,
    regex: /(?<!\d)1[3-9]\d{9}(?!\d)/,
    locale: 'cn',
    label: 'Chinese mobile number',
  },
  {
    type: PiiType.BANK_CARD,
    regex: /(?<!\d)\d{16,19}(?!\d)/,
    locale: 'cn',
    label: 'Chinese bank card number',
    validator: luhnBankCard,
  },

  // ── US ─────────────────────────────────────────────────────────────────

  {
    type: PiiType.SSN,
    regex: /\b\d{3}-\d{2}-\d{4}\b/,
    locale: 'us',
    label: 'US SSN (dashed)',
  },
  {
    type: PiiType.SSN,
    regex: /(?<!\d)\d{9}(?!\d)/,
    locale: 'us',
    label: 'US SSN (9 digits)',
    validator: (match: string) => {
      // SSN cannot start with 9xx, 000, or have 00 in group 2 / 0000 in group 3
      const area = parseInt(match.substring(0, 3), 10)
      const group = parseInt(match.substring(3, 5), 10)
      const serial = parseInt(match.substring(5, 9), 10)
      if (area === 0 || area >= 900) return false
      if (group === 0) return false
      if (serial === 0) return false
      return true
    },
  },
  {
    type: PiiType.PHONE,
    regex: /(?:\+1\s?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/,
    locale: 'us',
    label: 'US phone number',
  },

  // ── EU ─────────────────────────────────────────────────────────────────

  {
    type: PiiType.PASSPORT,
    regex: /\b[A-Z]{2}\d{6,9}\b/,
    locale: 'eu',
    label: 'EU passport number',
  },
]
