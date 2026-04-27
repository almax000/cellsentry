/**
 * Literal string replacement for the v2 lean pipeline (D19 reinterpreted).
 *
 * Replaces every occurrence of mapping keys (real_name, aliases, additional
 * entities) with their pseudonyms via String.prototype.replaceAll. Keys are
 * sorted longest-first so "张三丰" substitutes before "张三" — this prevents
 * the naive shorter-substring corruption that motivated the abandoned jieba
 * whole-token approach.
 *
 * Trade-off accepted (ADR D19): If the input contains a name not in the
 * mapping that shares a prefix/suffix with a mapped key, the user is
 * responsible for adding both as separate mapping entries. The lean pipeline
 * never disambiguates — it does exactly what the mapping says.
 *
 * Day 4 will extend this to non-name PII (phone / address / ID / SS / employer)
 * once parser/builder/writer expand to the 6-category D33 schema.
 */

import type { PseudonymMap, Replacement } from '../types'

interface ReplaceInput {
  mapping: PseudonymMap
  text: string
}

interface ReplaceOutput {
  output: string
  replacements: Replacement[]
}

interface KeyEntry {
  real: string
  pseudonym: string
}

function collectKeys(mapping: PseudonymMap): KeyEntry[] {
  const keys: KeyEntry[] = []
  for (const p of mapping.patients) {
    keys.push({ real: p.real_name, pseudonym: p.pseudonym })
    for (const alias of p.aliases) {
      keys.push({ real: alias, pseudonym: p.pseudonym })
    }
    for (const ae of p.additional_entities) {
      keys.push({ real: ae.real, pseudonym: ae.pseudonym })
    }
  }
  // Longest first so "张三丰" beats "张三" when both are mapped.
  return keys.sort((a, b) => b.real.length - a.real.length).filter((k) => k.real.length > 0)
}

export async function replaceWithMapping({ mapping, text }: ReplaceInput): Promise<ReplaceOutput> {
  const keys = collectKeys(mapping)
  if (keys.length === 0) {
    return { output: text, replacements: [] }
  }

  const replacements: Replacement[] = []
  let output = text

  for (const { real, pseudonym } of keys) {
    if (!output.includes(real)) continue

    let cursor = 0
    while (true) {
      const idx = output.indexOf(real, cursor)
      if (idx === -1) break
      replacements.push({
        original: real,
        pseudonym,
        span: [idx, idx + real.length],
        reason: 'mapping',
      })
      output = output.slice(0, idx) + pseudonym + output.slice(idx + real.length)
      cursor = idx + pseudonym.length
    }
  }

  return { output, replacements }
}
