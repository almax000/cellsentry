/**
 * Unit tests for parser + builder + writer (lean rebuild).
 *
 * Plan v3 mandated cases that survive the lean rebuild:
 *   - valid YAML (one + multi-patient)
 *   - empty file → empty mapping
 *   - missing patient_id rejected
 *   - empty alias string rejected
 *   - alias collision across patients (within-mapping uniqueness — different
 *     concept from the deleted cross-text collisionScan)
 *   - additional_entities validated
 *   - incremental append + counter discipline
 *   - counter overflow past Z
 *   - manual override wins
 *   - round-trip stability
 *   - base26 boundary cases
 *   - E014 quarantine on corrupt existing
 *
 * Removed (per ADR — D21/AD3/AD4 revoked):
 *   - date_mode validation
 *   - date_offset_days persistence
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  MappingParseError,
  loadMapping,
  parseMappingText,
} from './parser'
import { addPatient, base26, nextPseudonym } from './builder'
import { listQuarantined, serializeMapping, writeMapping } from './writer'
import type { PseudonymMap } from '../types'

// ---------------------------------------------------------------------------
// base26 — Excel column naming
// ---------------------------------------------------------------------------

describe('base26', () => {
  const cases: [number, string][] = [
    [0, 'A'],
    [1, 'B'],
    [25, 'Z'],
    [26, 'AA'],   // boundary
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'], // boundary
    [703, 'AAB'],
  ]
  for (const [n, expected] of cases) {
    it(`${n} → ${expected}`, () => {
      expect(base26(n)).toBe(expected)
    })
  }

  it('rejects negative input', () => {
    expect(() => base26(-1)).toThrow(RangeError)
  })

  it('rejects non-integer input', () => {
    expect(() => base26(1.5)).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// nextPseudonym
// ---------------------------------------------------------------------------

describe('nextPseudonym', () => {
  it('first patient gets 患者A', () => {
    expect(nextPseudonym(0)).toEqual({ pseudonym: '患者A', nextIndex: 1 })
  })

  it('27th patient (index 26) gets 患者AA — counter overflow past Z', () => {
    expect(nextPseudonym(26)).toEqual({ pseudonym: '患者AA', nextIndex: 27 })
  })

  it('28th patient gets 患者AB', () => {
    expect(nextPseudonym(27).pseudonym).toBe('患者AB')
  })
})

// ---------------------------------------------------------------------------
// parseMappingText — happy path + validation
// ---------------------------------------------------------------------------

describe('parseMappingText', () => {
  it('parses a valid file with one patient', () => {
    const text = `
version: 1
next_pseudonym_index: 1
patients:
  - patient_id: family-001
    real_name: 张三
    aliases: [张先生]
    pseudonym: 患者A
    additional_entities: []
`
    const map = parseMappingText(text, '/tmp/m.md')
    expect(map.version).toBe(1)
    expect(map.next_pseudonym_index).toBe(1)
    expect(map.patients).toHaveLength(1)
    expect(map.patients[0].real_name).toBe('张三')
    expect(map.patients[0].pseudonym).toBe('患者A')
    expect(map.source_path).toBe('/tmp/m.md')
  })

  it('treats an empty file as a zero-state mapping', () => {
    const map = parseMappingText('', '/tmp/empty.md')
    expect(map.patients).toHaveLength(0)
    expect(map.next_pseudonym_index).toBe(0)
  })

  it('treats a comments-only file as a zero-state mapping', () => {
    const text = `# just comments\n# no real content\n`
    const map = parseMappingText(text, '/tmp/m.md')
    expect(map.patients).toHaveLength(0)
  })

  it('rejects missing patient_id', () => {
    const text = `
version: 1
next_pseudonym_index: 0
patients:
  - real_name: 张三
    pseudonym: 患者A
`
    expect(() => parseMappingText(text, '/tmp/m.md')).toThrow(MappingParseError)
  })

  it('rejects empty alias string', () => {
    const text = `
version: 1
next_pseudonym_index: 1
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: ['']
    pseudonym: 患者A
`
    expect(() => parseMappingText(text, '/tmp/m.md')).toThrow(/empty string/)
  })

  it('rejects unsupported version', () => {
    const text = `version: 2\nnext_pseudonym_index: 0\n`
    expect(() => parseMappingText(text, '/tmp/m.md')).toThrow(/version/)
  })

  it('rejects negative next_pseudonym_index', () => {
    const text = `version: 1\nnext_pseudonym_index: -1\npatients: []\n`
    expect(() => parseMappingText(text, '/tmp/m.md')).toThrow(/next_pseudonym_index/)
  })

  it('rejects alias collision across patients (within-mapping uniqueness)', () => {
    const text = `
version: 1
next_pseudonym_index: 2
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: [张先生]
    pseudonym: 患者A
  - patient_id: f-2
    real_name: 李四
    aliases: [张先生]
    pseudonym: 患者B
`
    expect(() => parseMappingText(text, '/tmp/m.md')).toThrow(/collision/)
  })

  it('parses additional_entities correctly', () => {
    const text = `
version: 1
next_pseudonym_index: 1
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: []
    pseudonym: 患者A
    additional_entities:
      - real: 李四 (daughter)
        pseudonym: 家属A
`
    const map = parseMappingText(text, '/tmp/m.md')
    expect(map.patients[0].additional_entities).toEqual([
      { real: '李四 (daughter)', pseudonym: '家属A' },
    ])
  })
})

// ---------------------------------------------------------------------------
// loadMapping — file IO
// ---------------------------------------------------------------------------

describe('loadMapping', () => {
  it('reads + parses a real file from disk', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-map-'))
    try {
      const path = join(tmp, 'pseudonym-map.md')
      writeFileSync(path, `version: 1\nnext_pseudonym_index: 0\npatients: []\n`)
      const map = await loadMapping(path)
      expect(map.version).toBe(1)
      expect(map.source_path).toBe(path)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('throws MappingParseError for nonexistent path', async () => {
    await expect(loadMapping('/nonexistent/path.md')).rejects.toThrow(MappingParseError)
  })
})

// ---------------------------------------------------------------------------
// addPatient — incremental append, counter discipline
// ---------------------------------------------------------------------------

describe('addPatient', () => {
  const empty: PseudonymMap = {
    version: 1,
    next_pseudonym_index: 0,
    patients: [],
    source_path: '/tmp/m.md',
  }

  it('first patient (no manual pseudonym) gets 患者A and counter goes to 1', () => {
    const map = addPatient(empty, { patient_id: 'f-1', real_name: '张三' })
    expect(map.patients).toHaveLength(1)
    expect(map.patients[0].pseudonym).toBe('患者A')
    expect(map.next_pseudonym_index).toBe(1)
  })

  it('manual pseudonym wins but counter still increments (avoid future reuse)', () => {
    const map = addPatient(empty, {
      patient_id: 'f-1',
      real_name: '张三',
      pseudonym: '老张',
    })
    expect(map.patients[0].pseudonym).toBe('老张')
    expect(map.next_pseudonym_index).toBe(1)
  })

  it('three appends produce 患者A, 患者B, 患者C (counter persists across calls)', () => {
    let map = empty
    map = addPatient(map, { patient_id: 'f-1', real_name: '张三' })
    map = addPatient(map, { patient_id: 'f-2', real_name: '李四' })
    map = addPatient(map, { patient_id: 'f-3', real_name: '王五' })
    expect(map.patients.map(p => p.pseudonym)).toEqual(['患者A', '患者B', '患者C'])
    expect(map.next_pseudonym_index).toBe(3)
  })

  it('immutable update — does not mutate the input map', () => {
    addPatient(empty, { patient_id: 'f-1', real_name: '张三' })
    expect(empty.patients).toHaveLength(0)
    expect(empty.next_pseudonym_index).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Round-trip — serializeMapping + parseMappingText preserve content
// ---------------------------------------------------------------------------

describe('round-trip stability', () => {
  it('serialize → parse preserves all patient fields', () => {
    const original: PseudonymMap = {
      version: 1,
      next_pseudonym_index: 2,
      source_path: '/tmp/m.md',
      patients: [
        {
          patient_id: 'f-1',
          real_name: '张三',
          aliases: ['张先生', 'Zhang San'],
          pseudonym: '患者A',
          additional_entities: [{ real: '李四', pseudonym: '家属A' }],
        },
        {
          patient_id: 'f-2',
          real_name: '王五',
          aliases: [],
          pseudonym: '患者B',
          additional_entities: [],
        },
      ],
    }
    const text = serializeMapping(original)
    const reparsed = parseMappingText(text, '/tmp/m.md')
    expect(reparsed).toEqual(original)
  })

  it('writeMapping round-trips through disk', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-map-'))
    try {
      const path = join(tmp, 'pseudonym-map.md')
      const original: PseudonymMap = {
        version: 1,
        next_pseudonym_index: 1,
        source_path: path,
        patients: [
          {
            patient_id: 'f-1',
            real_name: '张三',
            aliases: ['张先生'],
            pseudonym: '患者A',
            additional_entities: [],
          },
        ],
      }
      await writeMapping(original)
      const loaded = await loadMapping(path)
      expect(loaded.patients[0].real_name).toBe('张三')
      const text = readFileSync(path, 'utf-8')
      expect(text).toContain('CellSentry pseudonym map')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// E014 quarantine — corrupt existing file is preserved before overwrite
// ---------------------------------------------------------------------------

describe('writeMapping — E014 quarantine on corrupt existing', () => {
  it('quarantines a corrupt existing mapping before overwrite', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-quarantine-'))
    try {
      const path = join(tmp, 'pseudonym-map.md')
      writeFileSync(path, 'version: 1\npatients:\n  - this is invalid: [\n', 'utf-8')

      const newMap: PseudonymMap = {
        version: 1,
        next_pseudonym_index: 1,
        source_path: path,
        patients: [
          {
            patient_id: 'f-1',
            real_name: '李四',
            aliases: [],
            pseudonym: '患者A',
            additional_entities: [],
          },
        ],
      }

      await writeMapping(newMap)

      const reloaded = await loadMapping(path)
      expect(reloaded.patients[0].real_name).toBe('李四')

      const quarantined = await listQuarantined(tmp)
      expect(quarantined.length).toBe(1)
      const recovered = readFileSync(quarantined[0], 'utf-8')
      expect(recovered).toContain('this is invalid')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('does NOT quarantine when existing file parses cleanly', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-quarantine-'))
    try {
      const path = join(tmp, 'pseudonym-map.md')
      writeFileSync(
        path,
        `version: 1
next_pseudonym_index: 0
patients: []
`,
        'utf-8',
      )

      const newMap: PseudonymMap = {
        version: 1,
        next_pseudonym_index: 1,
        source_path: path,
        patients: [
          {
            patient_id: 'f-1',
            real_name: '张三',
            aliases: [],
            pseudonym: '患者A',
            additional_entities: [],
          },
        ],
      }

      await writeMapping(newMap)
      const quarantined = await listQuarantined(tmp)
      expect(quarantined).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('does NOT quarantine when target file does not exist (first write)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-quarantine-'))
    try {
      const path = join(tmp, 'pseudonym-map.md')
      const newMap: PseudonymMap = {
        version: 1,
        next_pseudonym_index: 0,
        source_path: path,
        patients: [],
      }
      await writeMapping(newMap)
      const quarantined = await listQuarantined(tmp)
      expect(quarantined).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
