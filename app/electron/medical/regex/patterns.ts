/**
 * Regex patterns + validators for Chinese medical document PII (W3 Step 3.5).
 *
 * Migrated from v1.x `electron/pii/patterns.ts` (CN section retained;
 * universal/US/EU patterns dropped — v2 scope is Chinese medical only).
 *
 * Each pattern carries:
 *   - `regex`: single global regex, capture group 1 = the value (when label-anchored)
 *   - `validator?`: post-match check (Luhn / GB 11643-1999 / etc.). Validated
 *     matches get `confidence: 'high'`; unvalidated label-anchored matches
 *     `medium`; bare numeric matches without validator `low`.
 *   - `defaultMasking`: how `applyMasking` rewrites the value by default.
 *     User can override per-finding via the mapping YAML's mask column (W4).
 *
 * Confidence semantics:
 *   high   — validator passed; replace as-is in pipeline
 *   medium — label-anchored match without validator; safe to replace
 *   low    — opportunistic match; surface to user before replacing
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

export type RegexConfidence = 'high' | 'medium' | 'low'
export type MaskingMode = 'full' | 'partial' | 'omit'

export interface CnPattern {
  type: CnPiiType
  regex: RegExp
  label: string
  validator?: (match: string) => boolean
  defaultConfidence: RegexConfidence
  defaultMasking: MaskingMode
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
    defaultConfidence: 'high', // checksum-validated
    defaultMasking: 'full',
  },
  {
    type: CnPiiType.MOBILE,
    regex: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    label: 'Chinese mobile number',
    defaultConfidence: 'high', // structural pattern (1[3-9]xxxxxxxxx) + length anchor
    defaultMasking: 'partial', // keep last 4 — same as banks do for receipts
  },
  {
    type: CnPiiType.EMAIL,
    regex: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,
    label: 'Email address',
    defaultConfidence: 'high',
    defaultMasking: 'partial',
  },
  {
    type: CnPiiType.BANK_CARD,
    regex: /(?<!\d)\d{16,19}(?!\d)/g,
    label: 'Bank card number',
    validator: luhnBankCard,
    defaultConfidence: 'high', // Luhn-validated
    defaultMasking: 'partial',
  },
  // Hospital identifiers — label-anchored. Capture group 1 = the value.
  // Allows letters + digits + hyphens, 6-20 chars. Without the label keyword
  // we don't flag these (would over-match plain numbers in clinical data).
  {
    type: CnPiiType.MEDICAL_RECORD,
    regex: /病历号[:：\s]*([A-Z0-9][A-Z0-9-]{5,19})/g,
    label: 'Medical record number (病历号)',
    defaultConfidence: 'medium',
    defaultMasking: 'full',
  },
  {
    type: CnPiiType.INSURANCE,
    regex: /医保(?:卡)?号[:：\s]*([A-Z0-9][A-Z0-9-]{5,19})/g,
    label: 'Health insurance number (医保号)',
    defaultConfidence: 'medium',
    defaultMasking: 'full',
  },
  {
    type: CnPiiType.VISIT,
    regex: /就诊号[:：\s]*([A-Z0-9][A-Z0-9-]{5,19})/g,
    label: 'Visit number (就诊号)',
    defaultConfidence: 'medium',
    defaultMasking: 'full',
  },
]

// ---------------------------------------------------------------------------
// Finder + masking
// ---------------------------------------------------------------------------

export interface RegexFinding {
  type: CnPiiType
  /** The exact value matched (without any label prefix). */
  match: string
  /** Position of `match` in the input (start, end). */
  span: [number, number]
  confidence: RegexConfidence
  /** Default masking mode for this finding — caller may override. */
  masking: MaskingMode
  /** Human-readable label for UI / audit log. */
  label: string
}

/**
 * Find every Chinese-medical PII pattern in `text`. Returns findings in
 * left-to-right order with overlapping matches resolved (longest wins;
 * leftmost-then-longest tie-break).
 */
export function findRegexPii(text: string): RegexFinding[] {
  const all: RegexFinding[] = []

  for (const pattern of CN_MEDICAL_PATTERNS) {
    // Re-create regex per pass to reset lastIndex for global flag.
    const re = new RegExp(pattern.regex.source, pattern.regex.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      // For label-anchored patterns, capture group 1 is the value; otherwise
      // the whole match.
      const hasCapture = m[1] !== undefined
      const value = hasCapture ? m[1] : m[0]
      const start = hasCapture ? m.index + m[0].indexOf(m[1]) : m.index
      const end = start + value.length

      // Apply validator (e.g. Luhn). On validator FAIL, downgrade confidence
      // rather than dropping — user might still want to review.
      let confidence = pattern.defaultConfidence
      if (pattern.validator && !pattern.validator(value)) {
        confidence = 'low'
      }

      all.push({
        type: pattern.type,
        match: value,
        span: [start, end],
        confidence,
        masking: pattern.defaultMasking,
        label: pattern.label,
      })

      // Avoid infinite loops on zero-length matches.
      if (m[0].length === 0) re.lastIndex += 1
    }
  }

  // Resolve overlaps: leftmost first, longest wins on ties.
  all.sort((a, b) => {
    if (a.span[0] !== b.span[0]) return a.span[0] - b.span[0]
    return (b.span[1] - b.span[0]) - (a.span[1] - a.span[0])
  })
  const resolved: RegexFinding[] = []
  let cursor = 0
  for (const f of all) {
    if (f.span[0] >= cursor) {
      resolved.push(f)
      cursor = f.span[1]
    }
  }
  return resolved
}

/**
 * Apply a masking mode to a value. Pure function — caller integrates into
 * the orchestrator's text-rewriting step.
 *
 *   full     → "[label]"           e.g. [病历号]
 *   partial  → keep last 4 chars   e.g. ****1234
 *   omit     → empty string
 */
export function applyMasking(finding: RegexFinding, mode?: MaskingMode): string {
  const m = mode ?? finding.masking
  if (m === 'omit') return ''
  if (m === 'partial') {
    const keepN = 4
    if (finding.match.length <= keepN) return finding.match
    const stars = '*'.repeat(Math.min(finding.match.length - keepN, 8))
    return stars + finding.match.slice(-keepN)
  }
  // full
  const labelMap: Record<CnPiiType, string> = {
    [CnPiiType.ID_CARD]: '[身份证号]',
    [CnPiiType.MOBILE]: '[手机号]',
    [CnPiiType.EMAIL]: '[邮箱]',
    [CnPiiType.BANK_CARD]: '[银行卡号]',
    [CnPiiType.MEDICAL_RECORD]: '[病历号]',
    [CnPiiType.INSURANCE]: '[医保号]',
    [CnPiiType.VISIT]: '[就诊号]',
  }
  return labelMap[finding.type]
}
