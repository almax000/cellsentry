/** Small text helpers shared by the detectors, the leftover check and restore. */

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Spaces OCR tends to insert inside a value. Newlines are bridged only for a value that has one itself, or a long one. */
const INNER_GAP = '[ \\t]*'
const INNER_GAP_OR_BREAK = '[ \\t]*(?:\\n[ \\t]*)?'
const INNER_GAP_OR_BREAKS = '[ \\t]*(?:\\n[ \\t]*){0,2}'

/**
 * Characters people and OCR put between the digits of one number, after
 * normalizeText: spaces, dashes, middle dots, slashes, underscores, commas and
 * full stops. Used inside a regex character class.
 */
export const NUMBER_SEPARATORS = ' \\t\\-\\u00b7\\u30fb\\u2027/_,.'

// Every mapping below is one UTF-16 code unit to one, so offsets stay valid.
const SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g
const INVISIBLE = /[\u00ad\u180e\u200b-\u200f\u2060-\u2064\ufeff]/g
const LINE_BREAKS = /[\u2028\u2029]/g
const DASHES = /[\u2010-\u2015\u2043\u2212\ufe58\ufe63]/g
const FULL_WIDTH = /[\uff01-\uff5e]/g

/**
 * One spelling for characters that look alike: full-width ASCII (１３９, ＡＢ,
 * ：（）) becomes half-width, every kind of space and invisible character a
 * plain space, every dash a hyphen. Detection, the leftover check, "My info"
 * and restore all compare normalized text, so they cannot disagree.
 */
export function normalizeText(text: string): string {
  return text
    .replace(FULL_WIDTH, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(SPACES, ' ')
    .replace(INVISIBLE, ' ')
    .replace(LINE_BREAKS, '\n')
    .replace(DASHES, '-')
}

/** Kept for callers that only need the width mapping; normalizeText is a superset. */
export const toHalfWidth = normalizeText

/**
 * A number-like value with up to three separators between its characters, so
 * 139 1234 5678, 139\u00b71234\u00b75678 and OCR's 139  1234  5678 match 13912345678.
 * Returns null for values too short to search safely.
 */
export function looseNumberPattern(value: string): string | null {
  const chars = [...compactNumber(value)]
  if (chars.length < 4) return null
  return chars.map(escapeRegExp).join(`[${NUMBER_SEPARATORS}]{0,3}`)
}

/** Above this length a value is matched as written: per-character gaps would make the regex too large. */
const MAX_LOOSE_TEXT = 120

/**
 * A text value with optional spaces between characters (OCR often splits 张伟 into 张 伟). A value
 * that a narrow column broke over two lines (…单元250\n1室) may be broken anywhere where it appears again.
 * With `lines` (an address), any copy may be broken anywhere, by a line break or a blank line.
 */
export function looseTextPattern(value: string, lines = false): string | null {
  const chars = [...normalizeText(value).replace(/\s+/g, '')]
  if (chars.length < 2) return null
  return chars.map(escapeRegExp).join(chars.length > MAX_LOOSE_TEXT ? '' : lines ? INNER_GAP_OR_BREAKS : value.includes('\n') ? INNER_GAP_OR_BREAK : INNER_GAP)
}

/** Digits and letters only, upper-cased: the identity of a number-like value. Full-width digits count. */
export function compactNumber(value: string): string {
  return normalizeText(value).replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** Whitespace removed and letters upper-cased: the identity of a text value. */
export function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '').toUpperCase()
}

/** Phone numbers written with a +86, 86 or 0086 country code are the same number. */
export function compactPhone(value: string): string {
  const digits = compactNumber(value)
  const mobile = /^(?:0086|86)(1[3-9]\d{9})$/.exec(digits)
  return mobile ? mobile[1] : digits
}

export function isCjk(char: string | undefined): boolean {
  return char !== undefined && /[\u3400-\u9fff\uf900-\ufaff]/.test(char)
}

/** Chinese 18-digit resident ID checksum (GB 11643-1999). */
export function cnIdChecksum(id: string): boolean {
  const value = id.toUpperCase()
  if (!/^\d{17}[\dX]$/.test(value)) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0)
  return '10X98765432'[sum % 11] === value[17]
}

/** Luhn check used by bank cards. */
export function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 12 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}
