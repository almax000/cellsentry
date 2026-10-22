import { PiiType } from './types'
import { PII_PATTERNS } from './patterns'

/**
 * Produce the same human-readable masked value used by scan previews and
 * exported redacted workbooks.
 */
export function maskValue(value: string, piiType: string): string {
  switch (piiType) {
    case PiiType.EMAIL: {
      const atIdx = value.indexOf('@')
      if (atIdx <= 1) return '***' + value.substring(atIdx)
      return value[0] + '***' + value.substring(atIdx)
    }
    case PiiType.PHONE: {
      const digits = value.replace(/\D/g, '')
      if (digits.length <= 4) return '****'
      return digits.substring(0, 3) + '****' + digits.substring(digits.length - 4)
    }
    case PiiType.ID_NUMBER: {
      const cleaned = value.replace(/\s/g, '')
      if (cleaned.length <= 6) return '******'
      return cleaned.substring(0, 4) + '**********' + cleaned.substring(cleaned.length - 4)
    }
    case PiiType.CREDIT_CARD:
    case PiiType.BANK_CARD: {
      const digits = value.replace(/\D/g, '')
      if (digits.length <= 4) return '****'
      return '****-****-****-' + digits.substring(digits.length - 4)
    }
    case PiiType.SSN:
      return value.includes('-') ? '***-**-' + value.substring(value.length - 4) : '*****' + value.substring(value.length - 4)
    default:
      return value.length <= 4 ? '****' : value.substring(0, 2) + '***' + value.substring(value.length - 2)
  }
}

/** Mask every validated occurrence of a type, including its locale variants. */
export function maskPiiText(value: string, piiType: string): string {
  let redacted = value
  for (const pattern of PII_PATTERNS.filter((item) => item.type === piiType)) {
    const flags = pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`
    redacted = redacted.replace(new RegExp(pattern.regex.source, flags), (matched) => {
      if (pattern.validator && !pattern.validator(matched)) return matched
      return maskValue(matched, piiType)
    })
  }
  return redacted
}
