/**
 * Pseudonym map writer (W3 Step 3.2).
 *
 * Round-trips a PseudonymMap back to the YAML+Markdown file format.
 * Preserves the helpful header comment so the user always sees instructions
 * when they hand-edit.
 */

import { writeFile } from 'fs/promises'
import { stringify as yamlStringify } from 'yaml'

import type { PseudonymMap } from '../types'

const HEADER_COMMENT = `# CellSentry pseudonym map
# Manage via the CellSentry app or hand-edit; the app respects manual changes.
# - patient_id: opaque identifier (any unique string)
# - real_name + aliases: case-sensitive; jieba uses these as user-dict keys
# - pseudonym: 患者A / 患者B / ... (auto) or any manual string
# - date_mode: preserve | offset_days | bucket_month
# - additional_entities: family members or others to redact alongside the patient

`

export function serializeMapping(map: PseudonymMap): string {
  // yamlStringify needs a plain object; re-build to avoid serializing
  // `source_path` (which is internal book-keeping, not part of the file format).
  const data = {
    version: map.version,
    next_pseudonym_index: map.next_pseudonym_index,
    patients: map.patients.map(p => ({
      patient_id: p.patient_id,
      real_name: p.real_name,
      aliases: p.aliases,
      pseudonym: p.pseudonym,
      date_mode: p.date_mode,
      ...(p.date_offset_days !== undefined ? { date_offset_days: p.date_offset_days } : {}),
      additional_entities: p.additional_entities,
    })),
  }

  // `defaultStringType: 'PLAIN'` keeps Chinese characters un-quoted; flow style
  // for short alias arrays is more readable than block.
  const yamlText = yamlStringify(data, {
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
    flowCollectionPadding: false,
    lineWidth: 0, // no wrapping — keeps long names on one line
  })

  return HEADER_COMMENT + yamlText
}

export async function writeMapping(map: PseudonymMap, path?: string): Promise<void> {
  const target = path ?? map.source_path
  if (!target) {
    throw new Error('writeMapping requires either map.source_path or an explicit path')
  }
  const text = serializeMapping(map)
  await writeFile(target, text, 'utf-8')
}
