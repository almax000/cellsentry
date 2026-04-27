/**
 * Pipeline orchestrator integration test (lean rebuild).
 *
 * Exercises the new lean pipeline: ingest → regex → literalReplace → audit.
 * No collision pre-scan, no date handler, no safety-net (all REVOKED per ADR).
 *
 * Day 6 will expand E2E coverage; this file is the deterministic vitest
 * gate that runs without OCR / model dependencies.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { runPipeline, runPipelineInline } from './orchestrator'

function withMappingFile<T>(yaml: string, fn: (path: string) => Promise<T>): Promise<T> {
  const tmp = mkdtempSync(join(tmpdir(), 'cs-orch-'))
  const path = join(tmp, 'pseudonym-map.md')
  writeFileSync(path, yaml)
  return fn(path).finally(() => rmSync(tmp, { recursive: true, force: true }))
}

const SAMPLE_MAPPING = `
version: 1
next_pseudonym_index: 2
patients:
  - patient_id: family-001
    real_name: 张三
    aliases: [张先生]
    pseudonym: 患者A
    additional_entities: []
  - patient_id: family-002
    real_name: 李四
    aliases: []
    pseudonym: 患者B
    additional_entities: []
`

describe('runPipeline — happy path on synthetic text', () => {
  it('replaces all CN mapping keys + applies regex masking', async () => {
    await withMappingFile(SAMPLE_MAPPING, async (mappingPath) => {
      const text =
        '患者 张三 (身份证 11010519491231002X, 联系电话 13812345678) 复诊。\n' +
        '陪同人 李四。\n' +
        '病历号: ABC-12345。'

      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })

      expect(result.output).toContain('患者A')
      expect(result.output).toContain('患者B')
      expect(result.output).not.toContain('张三')
      expect(result.output).not.toContain('李四')

      expect(result.output).toContain('[身份证号]')
      expect(result.output).toContain('[病历号]')
      expect(result.output).toMatch(/\*+5678/)

      const reasons = new Set(result.replacements.map(r => r.reason))
      expect(reasons.has('mapping')).toBe(true)
      expect(reasons.has('regex')).toBe(true)

      expect(result.timings.total_ms).toBeGreaterThanOrEqual(0)
      expect(result.timings.regex_ms).toBeGreaterThanOrEqual(0)
      expect(result.timings.mapping_ms).toBeGreaterThanOrEqual(0)
    })
  })

  it('D33: user phone mapping wins over regex fallback (mapping-first order)', async () => {
    const phoneMapping = `
version: 1
next_pseudonym_index: 1
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: []
    pseudonym: 患者A
    additional_entities:
      - real: 13812345678
        pseudonym: '[手机号-甲]'
`
    await withMappingFile(phoneMapping, async (mappingPath) => {
      const text = '张三 联系电话 13812345678 复诊。'
      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })
      // Mapping pseudonym wins; regex partial-mask `****5678` should NOT appear
      expect(result.output).toContain('[手机号-甲]')
      expect(result.output).not.toMatch(/\*+5678/)
      expect(result.output).toContain('患者A')
    })
  })

  it('D33: regex fallback catches PII not in user mapping', async () => {
    const minimalMapping = `
version: 1
next_pseudonym_index: 1
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: []
    pseudonym: 患者A
    additional_entities: []
`
    await withMappingFile(minimalMapping, async (mappingPath) => {
      const text = '张三 联系 13812345678 (mapping has no phone).'
      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })
      expect(result.output).toContain('患者A')
      expect(result.output).toMatch(/\*+5678/)
    })
  })

  it('returns pass-through for empty mapping', async () => {
    const emptyMapping = `version: 1\nnext_pseudonym_index: 0\npatients: []\n`
    await withMappingFile(emptyMapping, async (mappingPath) => {
      const text = '完全没有任何映射的输入文本。'
      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })
      expect(result.output).toBe(text)
      expect(result.replacements).toEqual([])
    })
  })

  it('still applies regex even when no name mappings exist', async () => {
    const emptyMapping = `version: 1\nnext_pseudonym_index: 0\npatients: []\n`
    await withMappingFile(emptyMapping, async (mappingPath) => {
      const text = '身份证 11010519491231002X 主要联系 13812345678'
      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })
      expect(result.output).toContain('[身份证号]')
      expect(result.output).toMatch(/\*+5678/)
      expect(result.replacements.every(r => r.reason === 'regex')).toBe(true)
    })
  })

  it('longest-key-first ordering: 张三丰 wins over 张三 when both are mapped', async () => {
    const richMapping = `
version: 1
next_pseudonym_index: 3
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: []
    pseudonym: 患者A
    additional_entities: []
  - patient_id: f-2
    real_name: 张三丰
    aliases: []
    pseudonym: 武术家A
    additional_entities: []
`
    await withMappingFile(richMapping, async (mappingPath) => {
      const text = '张三丰是张三的师傅。'
      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })
      expect(result.output).toContain('武术家A')
      expect(result.output).toContain('患者A')
      expect(result.output).not.toContain('张三')
    })
  })
})

describe('runPipelineInline — inline mapping text', () => {
  it('parses mapping from text + redacts', async () => {
    const text = '患者 张三 联系 13812345678'
    const result = await runPipelineInline(text, SAMPLE_MAPPING)
    expect(result.output).toContain('患者A')
    expect(result.output).toMatch(/\*+5678/)
  })
})

describe('runPipeline — audit timings sanity', () => {
  it('total_ms >= max(regex_ms, mapping_ms) on a non-trivial input', async () => {
    await withMappingFile(SAMPLE_MAPPING, async (mappingPath) => {
      const text = '张三 入院, 联系 13812345678'
      const result = await runPipeline({
        source: { kind: 'text', content: text },
        mapping_path: mappingPath,
      })
      expect(result.timings.total_ms).toBeGreaterThanOrEqual(result.timings.regex_ms)
      expect(result.timings.total_ms).toBeGreaterThanOrEqual(result.timings.mapping_ms)
    })
  })
})

describe('runPipeline — error surfaces', () => {
  it('throws PipelineError for unreadable mapping path', async () => {
    await expect(
      runPipeline({
        source: { kind: 'text', content: '文本' },
        mapping_path: '/nonexistent/mapping.md',
      }),
    ).rejects.toThrow(/Failed to load mapping/)
  })
})
