/**
 * YAML mapping parser. Loads `pseudonym-map.md` (Markdown with YAML frontmatter
 * + Markdown table body) and returns a typed PseudonymMap.
 *
 * Real implementation lands in W3 Step 3.2 (depends on `js-yaml` install).
 * Stub here only defines the surface so types compile.
 */

import type { PseudonymMap } from '../types'

export function loadMapping(_path: string): Promise<PseudonymMap> {
  throw new Error('TODO: W3 Step 3.2 — js-yaml + frontmatter parsing not wired')
}

export function parseMappingText(_text: string, _sourcePath: string): PseudonymMap {
  throw new Error('TODO: W3 Step 3.2 — frontmatter + table parsing not wired')
}
