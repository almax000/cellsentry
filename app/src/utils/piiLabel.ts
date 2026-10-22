import type { PiiType } from '../types'

/**
 * Some PII types cover several regional formats. The scanner reports which
 * pattern matched (`finding.pattern`, the English label in
 * electron/pii/patterns.ts), so a card can say "手机号" or "美国电话号码"
 * instead of a generic "电话号码", and "身份证号" instead of "证件号码".
 */
const PATTERN_VARIANTS: Record<string, string> = {
  'Chinese ID number (18-digit)': 'cnId',
  'Chinese mobile number': 'cnMobile',
  'US phone number': 'usPhone',
}

/** i18n key (namespace `pii`) for a finding's type label. */
export function piiLabelKey(piiType: PiiType, pattern?: string): string {
  const variant = pattern ? PATTERN_VARIANTS[pattern] : undefined
  return variant ? `piiTypeVariants.${variant}` : `piiTypes.${piiType}`
}
