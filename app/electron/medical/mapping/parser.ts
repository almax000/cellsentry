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
 *       additional_entities: []
 *     - patient_id: family-002
 *       real_name: 王五
 *       aliases: []
 *       pseudonym: 患者B
 */

import { readFile } from 'fs/promises'
import { parse as yamlParse } from 'yaml'

import type { PatientEntry, PseudonymMap } from '../types'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class MappingParseError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message)
    this.name = 'MappingParseError'
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

/** Coerce primitive YAML values (string / number / bigint / boolean) to string.
 *  Returns null when the value is missing or a non-primitive (object / array).
 *  Lets users write `real: 13812345678` in YAML without quoting. */
function coerceToString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v)
  return null
}

function coerceStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const x of v) {
    const s = coerceToString(x)
    if (s === null) return null
    out.push(s)
  }
  return out
}

function validatePatient(raw: unknown, idx: number): PatientEntry {
  if (!raw || typeof raw !== 'object') {
    throw new MappingParseError(`patients[${idx}] must be an object`)
  }
  const r = raw as Record<string, unknown>

  const patient_id = coerceToString(r.patient_id)
  if (patient_id === null || patient_id.length === 0) {
    throw new MappingParseError(`patients[${idx}].patient_id missing or empty`)
  }
  const real_name = coerceToString(r.real_name)
  if (real_name === null || real_name.length === 0) {
    throw new MappingParseError(`patients[${idx}].real_name missing or empty`)
  }
  const pseudonym = coerceToString(r.pseudonym)
  if (pseudonym === null || pseudonym.length === 0) {
    throw new MappingParseError(`patients[${idx}].pseudonym missing or empty`)
  }
  const aliasesRaw = r.aliases ?? []
  const aliases = coerceStringArray(aliasesRaw)
  if (aliases === null) {
    throw new MappingParseError(`patients[${idx}].aliases must be an array of strings`)
  }
  if (aliases.some(a => a.length === 0)) {
    throw new MappingParseError(`patients[${idx}].aliases contains an empty string`)
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
    const real = coerceToString(ee.real)
    if (real === null || real.length === 0) {
      throw new MappingParseError(`patients[${idx}].additional_entities[${j}].real missing`)
    }
    const ps = coerceToString(ee.pseudonym)
    if (ps === null || ps.length === 0) {
      throw new MappingParseError(`patients[${idx}].additional_entities[${j}].pseudonym missing`)
    }
    return { real, pseudonym: ps }
  })

  return {
    patient_id,
    real_name,
    aliases,
    pseudonym,
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
