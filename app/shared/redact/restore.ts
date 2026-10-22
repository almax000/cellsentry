/**
 * Put the originals back into the AI's answer.
 *
 * One pattern finds every code-shaped word (患者A, 电话1, Patient-A, also
 * written 患者 A or in traditional characters) and looks it up in the code
 * book, so the work does not grow with the size of the book.
 *
 * Nothing changes silently:
 * - A code followed by something that makes it read as an ordinary word
 *   (患者A型血, 电话1次, 家人B超) is "ambiguous": left as written, marked, and
 *   the user can switch it on.
 * - A code-shaped word we never issued is left untouched and reported, since
 *   the AI may have made it up.
 * - Every restored spot can be switched off again in the UI.
 */
import { CODE_PREFIX } from './codes'
import type { CodeBook, CodeLocale } from './types'
import { escapeRegExp, normalizeText } from './text'

export interface RestoreSegment {
  text: string
  /** The code as written in the answer and the original it stands for. */
  restored?: { code: string; original: string }
  /** Reads like an ordinary word; left as written unless the user switches it on. */
  ambiguous?: { code: string; original: string }
  unknownCode?: boolean
}

export interface RestoreResult {
  /** The answer with every unambiguous code restored. */
  text: string
  segments: RestoreSegment[]
  replaced: number
  ambiguous: number
  unknownCodes: string[]
}

/** Traditional spellings an AI may answer in, mapped to the prefixes we issue. */
const TRADITIONAL: Record<string, string> = {
  電話: '电话', 醫生: '医生', 證件: '证件', 銀行卡: '银行卡', 郵箱: '邮箱', 編號: '编号', 社保號: '社保号',
}

/** What makes a Chinese letter code read as part of a word (患者A型血, 家人B超, 患者C反应蛋白). */
const AFTER_LETTER = /^[ \t]*(?:型|组|级|类|区|座|栋|楼|床|超|族|群|细胞|反应|二聚体|倒置|抗原|抗体|肝)/
/** What makes a Chinese number code read as a count or a unit (电话1次, 证件1份, 地址1号楼, 电话1-2次). */
const AFTER_NUMBER = /^[ \t]*(?:次|个|份|张|名|位|周|天|月|年|岁|号|楼|床|室|层|栋|组|单元|区|座|幢|弄|期|级|型|倍|%|cm|mm|kg|mg|ml|-\d)/i

function prefixList(locale: CodeLocale): string[] {
  const issued = Object.values(CODE_PREFIX[locale]).map((prefix) => prefix.replace(/-$/, ''))
  const extra = locale === 'zh' ? Object.keys(TRADITIONAL) : []
  return [...issued, ...extra].sort((a, b) => b.length - a.length)
}

/** The lookup key of a code as written: simplified prefix, no gap, upper case. */
function codeKey(written: string, locale: CodeLocale): string {
  let value = normalizeText(written).replace(/[\s-]/g, '')
  for (const [traditional, simplified] of Object.entries(TRADITIONAL)) {
    if (value.startsWith(traditional)) value = simplified + value.slice(traditional.length)
  }
  return locale === 'en' ? value.toUpperCase() : value.replace(/[a-z]+$/, (letters) => letters.toUpperCase())
}

function codePattern(locale: CodeLocale, longestLetters: number): RegExp {
  const heads = prefixList(locale).map(escapeRegExp).join('|')
  const gap = locale === 'en' ? '[ \\t-]?' : '[ \\t]?'
  const lead = locale === 'en' ? '(?<![A-Za-z])' : ''
  // Case-sensitive: "patient a few days" must not look like a code.
  return new RegExp(`${lead}(?:${heads})${gap}(?:[A-Z]{1,${longestLetters}}(?![A-Za-z])|\\d{1,3}(?!\\d))`, 'g')
}

export function restoreAnswer(answer: string, book: CodeBook, locale: CodeLocale): RestoreResult {
  const byKey = new Map(book.entries.map((entry) => [codeKey(entry.code, locale), entry]))
  const longestLetters = Math.max(1, ...book.entries.map((entry) => /[A-Z]+$/.exec(entry.code)?.[0].length ?? 0))
  const matchText = normalizeText(answer)
  const segments: RestoreSegment[] = []
  const unknown = new Set<string>()
  let replaced = 0
  let ambiguous = 0
  let cursor = 0

  for (const match of matchText.matchAll(codePattern(locale, longestLetters))) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const written = answer.slice(start, end)
    const numeric = /\d$/.test(match[0])
    const after = matchText.slice(end, end + 6)
    const looksLikeWord = locale === 'zh' && (numeric ? AFTER_NUMBER : AFTER_LETTER).test(after)
    const entry = byKey.get(codeKey(match[0], locale))
    if (!entry && looksLikeWord) continue
    if (start > cursor) segments.push({ text: answer.slice(cursor, start) })
    if (entry && looksLikeWord) {
      segments.push({ text: written, ambiguous: { code: written, original: entry.display } })
      ambiguous++
    } else if (entry) {
      segments.push({ text: entry.display, restored: { code: written, original: entry.display } })
      replaced++
    } else {
      segments.push({ text: written, unknownCode: true })
      unknown.add(written)
    }
    cursor = end
  }
  if (cursor < answer.length) segments.push({ text: answer.slice(cursor) })

  return { text: segments.map((segment) => segment.text).join(''), segments, replaced, ambiguous, unknownCodes: [...unknown] }
}

/** The answer with the user's per-spot choices applied: `flipped` holds segment indexes to switch. */
export function restoredText(result: RestoreResult, flipped: ReadonlySet<number>): string {
  return result.segments.map((segment, index) => {
    if (segment.restored) return flipped.has(index) ? segment.restored.code : segment.text
    if (segment.ambiguous) return flipped.has(index) ? segment.ambiguous.original : segment.text
    return segment.text
  }).join('')
}
