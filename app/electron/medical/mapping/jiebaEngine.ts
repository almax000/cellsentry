/**
 * Jieba-based whole-token replacement engine (W3 Step 3.4).
 *
 * Pipeline (must run AFTER collisionScan resolved any overlaps — orchestrator
 * blocks if collisions exist; jieba would otherwise corrupt longer names by
 * replacing the embedded shorter mapping key):
 *
 *   1. Load jieba-wasm (lazy import; only paid when first redaction runs).
 *   2. For each mapping key (real_name + aliases), call add_word(key, 99999)
 *      so jieba treats it as an atomic unit during segmentation.
 *   3. Tokenize the input via jieba.tokenize(text, 'default'). Get back
 *      { word, start, end } tuples in order.
 *   4. Walk tokens: each token whose `word` matches a mapping key gets
 *      replaced with the patient's pseudonym. Other tokens pass through.
 *   5. For English / Latin names (mapping keys made of ASCII letters), jieba
 *      won't tokenize them as units — fall back to a word-boundary regex
 *      pass over the assembled output. Word boundary on Latin is reliable
 *      (unlike CJK), so this is safe.
 *   6. Return { output, replacements }.
 *
 * Why jieba-wasm vs nodejieba: jieba-wasm is pure WASM (no native compile,
 * no platform-specific binary). nodejieba's native build has historically
 * caused install failures on Dell PC Windows (per plan v3 Warning #4 ref).
 * jieba-wasm is slower (~10× for huge inputs) but for medical-record sizes
 * the difference is irrelevant.
 */

import type { PseudonymMap, Replacement } from '../types'

export interface JiebaReplaceInput {
  mapping: PseudonymMap
  text: string
}

export interface JiebaReplaceResult {
  output: string
  replacements: Replacement[]
}

// Lazy module reference; first call pays the WASM load cost (~50 ms).
type JiebaModule = {
  tokenize(text: string, mode: string, hmm?: boolean | null): Array<{ word: string; start: number; end: number }>
  add_word(word: string, freq?: number | null, tag?: string | null): number
}
let _jieba: JiebaModule | null = null

async function getJieba(): Promise<JiebaModule> {
  if (_jieba) return _jieba
  const mod = await import('jieba-wasm/node')
  _jieba = mod as unknown as JiebaModule
  return _jieba
}

const ASCII_KEY = /^[A-Za-z][A-Za-z0-9 .'-]*$/

/**
 * Build the replacement map: every mapping key (real_name + aliases) →
 * the patient's pseudonym. Includes additional_entities for completeness.
 *
 * Sort by length descending to avoid weird edge cases where a shorter key is
 * substring of a longer manually-listed key. (Collision pre-scan should have
 * handled the dangerous shorter/longer overlaps already; this is just for
 * deterministic processing order.)
 */
function buildKeyToPseudonym(map: PseudonymMap): Array<{ key: string; pseudonym: string }> {
  const entries: Array<{ key: string; pseudonym: string }> = []
  for (const p of map.patients) {
    entries.push({ key: p.real_name, pseudonym: p.pseudonym })
    for (const alias of p.aliases) {
      entries.push({ key: alias, pseudonym: p.pseudonym })
    }
    for (const ae of p.additional_entities) {
      entries.push({ key: ae.real, pseudonym: ae.pseudonym })
    }
  }
  return entries.sort((a, b) => b.key.length - a.key.length)
}

/**
 * Replace mapping keys in `text`. Two-phase:
 *   - jieba pass for CJK keys (whole-token replacement)
 *   - word-boundary regex pass for ASCII keys (jieba doesn't help here)
 */
export async function replaceWithMapping(input: JiebaReplaceInput): Promise<JiebaReplaceResult> {
  const entries = buildKeyToPseudonym(input.mapping)
  if (entries.length === 0) {
    return { output: input.text, replacements: [] }
  }

  const cjkEntries = entries.filter(e => /[一-鿿㐀-䶿]/.test(e.key))
  const asciiEntries = entries.filter(e => ASCII_KEY.test(e.key))
  // Other (mixed CJK+Latin or numeric) — fallback to literal substring replace.
  const otherEntries = entries.filter(e => !cjkEntries.includes(e) && !asciiEntries.includes(e))

  // -------- CJK pass via jieba ----------------------------------------------
  const replacements: Replacement[] = []
  let outChunks: string[] = []
  let cursor = 0

  if (cjkEntries.length > 0) {
    const jieba = await getJieba()
    // Inject mapping keys with very high frequency so jieba treats them as
    // atomic. weight 99999 is ~1000× any normal word frequency.
    for (const { key } of cjkEntries) {
      jieba.add_word(key, 99999, null)
    }

    const keyMap = new Map(cjkEntries.map(e => [e.key, e.pseudonym]))
    const tokens = jieba.tokenize(input.text, 'default')

    // Track running output length so replacement spans point into the OUTPUT
    // (post-substitution) — that's what diff viewers + downstream stages need.
    let outLen = 0

    for (const t of tokens) {
      // Push intervening text as-is (whitespace / punctuation between tokens).
      if (t.start > cursor) {
        const intervening = input.text.slice(cursor, t.start)
        outChunks.push(intervening)
        outLen += intervening.length
      }
      const pseudo = keyMap.get(t.word)
      if (pseudo !== undefined) {
        const start = outLen
        outChunks.push(pseudo)
        outLen += pseudo.length
        replacements.push({
          original: t.word,
          pseudonym: pseudo,
          span: [start, outLen],
          reason: 'mapping',
        })
      } else {
        outChunks.push(t.word)
        outLen += t.word.length
      }
      cursor = t.end
    }
    if (cursor < input.text.length) {
      outChunks.push(input.text.slice(cursor))
    }
  } else {
    outChunks = [input.text]
  }

  let assembled = outChunks.join('')

  // -------- ASCII pass — word-boundary regex over the assembled CJK output --
  // Note: spans are computed against `assembled` (post-CJK substitution), not
  // the original text. That's the right contract for the orchestrator's diff
  // viewer (it diffs original vs final output).
  for (const { key, pseudonym } of asciiEntries) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'g')
    let m: RegExpExecArray | null
    const matches: Array<[number, number]> = []
    while ((m = re.exec(assembled)) !== null) {
      matches.push([m.index, m.index + m[0].length])
      if (m.index === re.lastIndex) re.lastIndex += 1
    }
    // Walk in reverse so spans don't shift mid-replacement.
    for (let i = matches.length - 1; i >= 0; i--) {
      const [s, e] = matches[i]
      replacements.push({
        original: assembled.slice(s, e),
        pseudonym,
        span: [s, s + pseudonym.length],
        reason: 'mapping',
      })
      assembled = assembled.slice(0, s) + pseudonym + assembled.slice(e)
    }
  }

  // -------- Other pass — literal substring replace (numeric IDs, mixed) ----
  for (const { key, pseudonym } of otherEntries) {
    let from = 0
    while (true) {
      const idx = assembled.indexOf(key, from)
      if (idx < 0) break
      replacements.push({
        original: key,
        pseudonym,
        span: [idx, idx + pseudonym.length],
        reason: 'mapping',
      })
      assembled = assembled.slice(0, idx) + pseudonym + assembled.slice(idx + key.length)
      from = idx + pseudonym.length
    }
  }

  return { output: assembled, replacements }
}
