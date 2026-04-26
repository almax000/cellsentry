/**
 * Pre-pipeline collision scan (W3 Step 3.3 / AD3).
 *
 * Catches the `张三` / `张三丰` failure mode: mapping has `张三 → 患者A`, input
 * contains `张三丰` (legitimate longer name not in mapping). Without this scan,
 * jieba could whole-token segment `张三` even with weight 99999 — replacing
 * `张三` inside `张三丰` gives garbage `患者A丰`.
 *
 * Algorithm (W3 — heuristic without jieba; refine in Step 3.4):
 *   1. Build set of mapping keys (every patient's real_name + aliases).
 *   2. For each input chunk, for each mapping key K:
 *      a. Find every occurrence of K in the chunk.
 *      b. For each occurrence, check adjacent characters: are they CJK?
 *      c. If yes on either side, extend up to MAX_EXTEND chars in that
 *         direction while CJK is adjacent.
 *      d. The resulting "longer" substring is the flagged collision.
 *   3. Dedupe by (longer, shorter); record up to N context windows per pair.
 *
 * Pipeline orchestrator BLOCKS on non-empty return. UI surfaces the
 * CollisionWarningPanel (per `_design/v2/screen-2-collision-warning.md`).
 *
 * Limitation acknowledged: without jieba, this can produce somewhat noisy
 * "longer" values (e.g. for `张三在武当山`, we may flag `张三在武当山` as
 * "longer" when ideally we'd flag just `张三`). Step 3.4 swaps in jieba
 * segmentation for higher-fidelity "longer" extraction.
 */

import type { CollisionWarning, PseudonymMap } from '../types'

export interface CollisionScanInput {
  mapping: PseudonymMap
  /** Input text chunks (one per OCR page or text block). */
  chunks: string[]
}

// Extension length: just 1 CJK char on each side. Larger values produce
// unstable "longer" strings (each occurrence captures slightly different
// neighbors → no dedupe → noisy UI). Larger values also tend to exceed
// real Chinese name lengths anyway. Trade-off: long compound names
// (慕容复古 = 4 chars) need exactly +1 extension to be caught when the
// mapping is shorter; longer compound forms (5+ char names) require jieba
// segmentation, which arrives in Step 3.4.
const MAX_EXTEND = 1
const MAX_CONTEXTS_PER_PAIR = 3 // cap to keep UI panel manageable
const CONTEXT_WINDOW = 16 // chars on each side for the user-visible context

/** True iff codepoint is CJK Unified Ideographs (basic + extension A). */
function isCjkChar(ch: string): boolean {
  if (!ch) return false
  const cp = ch.codePointAt(0) ?? 0
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf)
  )
}

/**
 * Common Chinese particles / function words that should NOT trigger collision
 * extension. Without jieba segmentation, the +1 CJK heuristic over-flags any
 * name followed by a CJK particle (e.g. `张三是另一个人` would flag `张三是`).
 *
 * This list is pragmatic: covers the most common medical-context particles
 * + structural / pronoun words. Step 3.4 swaps in jieba and this list becomes
 * unnecessary (kept as a fast-path).
 */
const CJK_PARTICLES = new Set([
  // Copulas / structural
  '是', '的', '之', '在', '于', '以', '所', '其', '为',
  // Conjunctions / discourse
  '和', '与', '或', '即', '也', '但', '而', '又', '还', '都', '亦',
  // Verbs of speech / report
  '说', '表', '报', '提', '称', '述', '问', '答', '示',
  // Aspect markers / negators
  '不', '没', '已', '才', '过', '把', '被', '让', '由', '使', '将',
  // Modal / aux
  '会', '能', '要', '应', '需', '可', '想', '愿',
  // Direction / motion
  '来', '去', '到', '上', '下', '出', '入',
  // Pronouns
  '他', '她', '它', '我', '你', '您', '咱',
  // Common time / position
  '前', '后', '中', '内', '外', '左', '右', '上', '下',
  // Misc common standalone
  '又', '再', '才', '最', '更', '很', '太', '极', '挺',
])

function extendRight(chunk: string, start: number, max: number): number {
  let i = start
  let count = 0
  while (i < chunk.length && count < max && isCjkChar(chunk[i])) {
    i += 1
    count += 1
  }
  return i
}

function extendLeft(chunk: string, end: number, max: number): number {
  let i = end - 1
  let count = 0
  while (i >= 0 && count < max && isCjkChar(chunk[i])) {
    i -= 1
    count += 1
  }
  return i + 1
}

function makeContext(chunk: string, start: number, end: number): string {
  const lo = Math.max(0, start - CONTEXT_WINDOW)
  const hi = Math.min(chunk.length, end + CONTEXT_WINDOW)
  const prefix = lo > 0 ? '…' : ''
  const suffix = hi < chunk.length ? '…' : ''
  return prefix + chunk.slice(lo, hi) + suffix
}

/**
 * Find all non-overlapping occurrences of `needle` in `hay`.
 * indexOf-based to avoid regex special-char escaping issues with arbitrary names.
 */
function findOccurrences(hay: string, needle: string): number[] {
  const positions: number[] = []
  let from = 0
  while (from <= hay.length - needle.length) {
    const idx = hay.indexOf(needle, from)
    if (idx < 0) break
    positions.push(idx)
    from = idx + needle.length
  }
  return positions
}

export function scanForCollisions(input: CollisionScanInput): CollisionWarning[] {
  // Build the set of mapping keys with O(1) "is this an exact key" lookup.
  const keys = new Set<string>()
  for (const p of input.mapping.patients) {
    keys.add(p.real_name)
    for (const a of p.aliases) keys.add(a)
  }

  // Sort keys longest-first so longer keys don't get masked by their shorter
  // prefixes during scanning (e.g. if both 张三 and 张三丰 are in the mapping,
  // we test 张三丰 first and skip 张三 wherever 张三丰 covered it).
  const orderedKeys = [...keys].sort((a, b) => b.length - a.length)

  // Map from "longer|shorter" → CollisionWarning (dedupe; aggregate contexts).
  const warnings = new Map<string, CollisionWarning>()

  for (const chunk of input.chunks) {
    const matchedRanges: Array<[number, number]> = []

    for (const shorter of orderedKeys) {
      // Skip non-CJK keys here — for English/Latin names, word-boundary regex
      // in jiebaEngine handles them correctly (no jieba-style overlap risk).
      if (!isCjkChar(shorter[0])) continue

      const occurrences = findOccurrences(chunk, shorter)
      for (const pos of occurrences) {
        const end = pos + shorter.length

        // Skip occurrences already inside a longer matched range — handled by
        // the longer key's pass.
        const inside = matchedRanges.some(([s, e]) => pos >= s && end <= e)
        if (inside) continue

        // Check whether extending in either direction yields more CJK *and*
        // that adjacent char isn't a known particle (which would just be
        // grammar, not a name-component).
        const leftCh = pos > 0 ? chunk[pos - 1] : ''
        const rightCh = end < chunk.length ? chunk[end] : ''
        const hasLeftCjk = isCjkChar(leftCh) && !CJK_PARTICLES.has(leftCh)
        const hasRightCjk = isCjkChar(rightCh) && !CJK_PARTICLES.has(rightCh)

        if (!hasLeftCjk && !hasRightCjk) continue // standalone, no overlap risk

        // Extend; the resulting [left, right) is the candidate "longer".
        const left = hasLeftCjk ? extendLeft(chunk, pos, MAX_EXTEND) : pos
        const right = hasRightCjk ? extendRight(chunk, end, MAX_EXTEND) : end
        const longer = chunk.slice(left, right)

        // If the extended token IS a mapping key on its own, no collision —
        // jieba would correctly segment to it (and replace it via its own entry).
        if (keys.has(longer)) continue

        // Only flag if longer is genuinely larger than shorter (it should be).
        if (longer === shorter) continue

        const key = `${longer}|${shorter}`
        let warning = warnings.get(key)
        if (!warning) {
          warning = { longer, shorter, contexts: [] }
          warnings.set(key, warning)
        }
        if (warning.contexts.length < MAX_CONTEXTS_PER_PAIR) {
          warning.contexts.push(makeContext(chunk, pos, end))
        }

        matchedRanges.push([pos, end])
      }
    }
  }

  return [...warnings.values()]
}
