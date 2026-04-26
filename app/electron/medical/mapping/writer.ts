/**
 * Pseudonym map writer (W3 Step 3.2 / W5 quarantine per E014).
 *
 * Round-trips a PseudonymMap back to the YAML+Markdown file format.
 * Preserves the helpful header comment so the user always sees instructions
 * when they hand-edit.
 *
 * E014 lesson — silent fallback on parse failure caused the TC-Ultra
 * incident where 134 sessions were lost. We apply the same discipline here:
 * before overwriting an existing pseudonym-map.md, attempt to parse it.
 * If the existing file is corrupt (hand-edit gone wrong, partial write,
 * encoding error), we MOVE it to a quarantine path before writing — never
 * silently overwrite. The user's old data is preserved at
 * `{archive}/.corrupt/{ISO_TIMESTAMP}-{basename}` so they can recover it.
 */

import { mkdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { dirname, basename, join } from 'path'
import { stringify as yamlStringify } from 'yaml'

import { parseMappingText, MappingParseError } from './parser'
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

  const yamlText = yamlStringify(data, {
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
    flowCollectionPadding: false,
    lineWidth: 0,
  })

  return HEADER_COMMENT + yamlText
}

/**
 * Quarantine an existing file before overwriting it. Returns the quarantine
 * path on success, or null if no quarantine was needed (file missing or
 * parsed cleanly).
 *
 * Logged at error level so a CI / log scrape catches the event. Never throws
 * — best-effort preservation; the calling write proceeds either way.
 */
async function quarantineIfCorrupt(target: string): Promise<string | null> {
  let existing: string
  try {
    existing = await readFile(target, 'utf-8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null // brand new file — no quarantine needed
    // Permission / I/O error — quarantine isn't possible, but caller's write
    // will surface the same error. Don't mask.
    return null
  }

  // Parse; if it succeeds, no quarantine needed.
  try {
    parseMappingText(existing, target)
    return null
  } catch (e) {
    if (!(e instanceof MappingParseError)) throw e
    // Existing file is corrupt. Move it aside.
    try {
      const targetDir = dirname(target)
      const corruptDir = join(targetDir, '.corrupt')
      await mkdir(corruptDir, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const quarantinePath = join(corruptDir, `${ts}-${basename(target)}`)
      await rename(target, quarantinePath)
      // ERROR-level log per E014 — surfaces in console + main process logs.
      console.error(
        `[mapping/writer] CORRUPT existing mapping quarantined: ${target} → ${quarantinePath}. ` +
          `Parse error: ${e.message}`,
      )
      return quarantinePath
    } catch (mvErr) {
      // Fail loudly — better to refuse the write than silently overwrite
      // corrupt-but-still-load-bearing data.
      throw new Error(
        `Mapping at ${target} is corrupt AND quarantine failed (${mvErr instanceof Error ? mvErr.message : String(mvErr)}). ` +
          `Refusing to overwrite. Original parse error: ${e.message}`,
      )
    }
  }
}

export async function writeMapping(map: PseudonymMap, path?: string): Promise<void> {
  const target = path ?? map.source_path
  if (!target) {
    throw new Error('writeMapping requires either map.source_path or an explicit path')
  }

  // E014 guard: never silently overwrite a corrupt existing file.
  await quarantineIfCorrupt(target)

  const text = serializeMapping(map)
  // Write to a temp neighbor + atomic rename → eliminates partial-write
  // corruption (Ctrl+C / power loss mid-fsync). Belt-and-suspenders.
  const tmpPath = `${target}.writing-${process.pid}`
  await writeFile(tmpPath, text, 'utf-8')
  await rename(tmpPath, target)
}

/** Exported for tests. */
export const __forTesting = { quarantineIfCorrupt }

/** Helper for tests + integration to assert what's recoverable. */
export async function listQuarantined(archiveDir: string): Promise<string[]> {
  const corruptDir = join(archiveDir, '.corrupt')
  try {
    const entries = await (await import('fs/promises')).readdir(corruptDir)
    return entries.map(e => join(corruptDir, e))
  } catch {
    return []
  }
}

void stat
