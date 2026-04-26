/**
 * Pseudonym mapping parser (W3 Step 3.2 / AD5 revised).
 *
 * File format: single YAML document at `{archive_dir}/pseudonym-map.md`.
 * The .md extension is for the user (so editors don't try to re-format YAML
 * as code) but the file is fully YAML-parseable. Plan v3 mentioned
 * "frontmatter + Markdown table body" as a possible format; we collapsed to
 * pure YAML because it round-trips cleanly through `yaml@2.x` with comments
 * preserved (better diff-friendliness than a Markdown table that can't
 * represent nested `additional_entities`).
 *
 * Example file:
 *
 *   # CellSentry pseudonym map
 *   # Manage via the CellSentry app or hand-edit. App respects manual edits.
 *   version: 1
 *   next_pseudonym_index: 7
 *   patients:
 *     - patient_id: family-001
 *       real_name: 张三
 *       aliases: [张先生, Zhang San]
 *       pseudonym: 患者A
 *       date_mode: preserve
 *       additional_entities: []
 *     - patient_id: family-002
 *       real_name: 王五
 *       aliases: []
 *       pseudonym: 患者B
 *       date_mode: offset_days
 *       date_offset_days: 30
 */

import { readFile } from 'fs/promises'
import { parse as yamlParse } from 'yaml'

import type { DateMode, PatientEntry, PseudonymMap } from '../types'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_DATE_MODES: readonly DateMode[] = ['preserve', 'offset_days', 'bucket_month']

export class MappingParseError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message)
    this.name = 'MappingParseError'
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function validatePatient(raw: unknown, idx: number): PatientEntry {
  if (!raw || typeof raw !== 'object') {
    throw new MappingParseError(`patients[${idx}] must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.patient_id !== 'string' || r.patient_id.length === 0) {
    throw new MappingParseError(`patients[${idx}].patient_id missing or empty`)
  }
  if (typeof r.real_name !== 'string' || r.real_name.length === 0) {
    throw new MappingParseError(`patients[${idx}].real_name missing or empty`)
  }
  if (typeof r.pseudonym !== 'string' || r.pseudonym.length === 0) {
    throw new MappingParseError(`patients[${idx}].pseudonym missing or empty`)
  }
  const aliases = r.aliases ?? []
  if (!isStringArray(aliases)) {
    throw new MappingParseError(`patients[${idx}].aliases must be an array of strings`)
  }
  // Reject empty alias entries — they'd inject blank-string keys into the
  // mapping and silently match the empty string everywhere.
  if (aliases.some(a => a.length === 0)) {
    throw new MappingParseError(`patients[${idx}].aliases contains an empty string`)
  }
  const dateMode: DateMode = (r.date_mode as DateMode) ?? 'preserve'
  if (!VALID_DATE_MODES.includes(dateMode)) {
    throw new MappingParseError(
      `patients[${idx}].date_mode must be one of: ${VALID_DATE_MODES.join(', ')}`,
    )
  }
  const additional = r.additional_entities ?? []
  if (!Array.isArray(additional)) {
    throw new MappingParseError(`patients[${idx}].additional_entities must be an array`)
  }
  const additionalValidated = additional.map((e, j) => {
    if (!e || typeof e !== 'object') {
      throw new MappingParseError(`patients[${idx}].additional_entities[${j}] must be an object`)
    }
    const ee = e as Record<string, unknown>
    if (typeof ee.real !== 'string' || ee.real.length === 0) {
      throw new MappingParseError(`patients[${idx}].additional_entities[${j}].real missing`)
    }
    if (typeof ee.pseudonym !== 'string' || ee.pseudonym.length === 0) {
      throw new MappingParseError(`patients[${idx}].additional_entities[${j}].pseudonym missing`)
    }
    return { real: ee.real, pseudonym: ee.pseudonym }
  })

  const offsetDays = r.date_offset_days
  const offset = typeof offsetDays === 'number' ? offsetDays : undefined

  return {
    patient_id: r.patient_id,
    real_name: r.real_name,
    aliases,
    pseudonym: r.pseudonym,
    date_mode: dateMode,
    date_offset_days: offset,
    additional_entities: additionalValidated,
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export function parseMappingText(text: string, sourcePath: string): PseudonymMap {
  let raw: unknown
  try {
    raw = yamlParse(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new MappingParseError(`YAML parse failed: ${msg}`, sourcePath)
  }

  if (raw === null || raw === undefined) {
    // Empty file → empty mapping. Return a zero-state map so the app can
    // launch with nothing yet defined.
    return {
      version: 1,
      next_pseudonym_index: 0,
      patients: [],
      source_path: sourcePath,
    }
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MappingParseError('top-level must be an object', sourcePath)
  }

  const r = raw as Record<string, unknown>
  if (r.version !== 1) {
    throw new MappingParseError(
      `unsupported version: ${String(r.version)} (expected 1)`,
      sourcePath,
    )
  }
  const nextIndex = r.next_pseudonym_index
  if (typeof nextIndex !== 'number' || !Number.isInteger(nextIndex) || nextIndex < 0) {
    throw new MappingParseError('next_pseudonym_index must be a non-negative integer', sourcePath)
  }

  const patientsRaw = r.patients ?? []
  if (!Array.isArray(patientsRaw)) {
    throw new MappingParseError('patients must be an array', sourcePath)
  }
  const patients = patientsRaw.map(validatePatient)

  // Cross-patient validation: alias collisions.
  const seenKeys = new Map<string, number>() // key → patient index
  patients.forEach((p, i) => {
    for (const key of [p.real_name, ...p.aliases]) {
      const prev = seenKeys.get(key)
      if (prev !== undefined && prev !== i) {
        throw new MappingParseError(
          `name collision: "${key}" used by both patient ${patients[prev].patient_id} and ${p.patient_id}`,
          sourcePath,
        )
      }
      seenKeys.set(key, i)
    }
  })

  return {
    version: 1,
    next_pseudonym_index: nextIndex,
    patients,
    source_path: sourcePath,
  }
}

export async function loadMapping(path: string): Promise<PseudonymMap> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new MappingParseError(`cannot read ${path}: ${msg}`, path)
  }
  return parseMappingText(text, path)
}
