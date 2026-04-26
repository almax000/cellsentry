/**
 * Pipeline orchestrator integration test (W3 Step 3.7).
 *
 * Uses synthetic text + preview_only=true to exercise the deterministic
 * stages (regex + collision + jieba) without OCR or safety-net network
 * calls. The full end-to-end smoke (with real OCR + Qwen) needs the user
 * to install mlx_vlm + mlx_lm + download the 5.68 GB of weights.
 *
 * Plan v3 verification target: synthetic doc → 100% known names replaced,
 * regex IDs caught, safety-net "none" on fully-mapped. We assert (1) and
 * (2) directly; safety-net is skipped via preview_only=true.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { runPipelineFromText } from './orchestrator'

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
    date_mode: preserve
    additional_entities: []
  - patient_id: family-002
    real_name: 李四
    aliases: []
    pseudonym: 患者B
    date_mode: preserve
    additional_entities: []
`

describe('runPipeline — happy path on synthetic text', () => {
  it('replaces all CN mapping keys + applies regex masking + skips safety-net in preview', async () => {
    await withMappingFile(SAMPLE_MAPPING, async (mappingPath) => {
      const text =
        '患者 张三 (身份证 11010519491231002X, 联系电话 13812345678) 复诊。\n' +
        '陪同人 李四。\n' +
        '病历号: ABC-12345。'

      const result = await runPipelineFromText(text, mappingPath, true /* preview */)

      // Names replaced
      expect(result.output).toContain('患者A')
      expect(result.output).toContain('患者B')
      expect(result.output).not.toContain('张三')
      expect(result.output).not.toContain('李四')

      // Regex masks applied
      expect(result.output).toContain('[身份证号]')
      expect(result.output).toContain('[病历号]')
      // Mobile uses partial mask by default
      expect(result.output).toMatch(/\*+5678/)

      // No safety-net flags in preview mode
      expect(result.pending_flags).toEqual([])

      // No collisions in this fully-mapped sample
      expect(result.collisions).toEqual([])

      // Replacements logged
      const reasons = new Set(result.replacements.map(r => r.reason))
      expect(reasons.has('mapping')).toBe(true)
      expect(reasons.has('regex')).toBe(true)

      // Timings populated
      expect(result.timings.total_ms).toBeGreaterThanOrEqual(0)
      expect(result.timings.regex_ms).toBeGreaterThanOrEqual(0)
      expect(result.timings.mapping_ms).toBeGreaterThanOrEqual(0)
    })
  })

  it('blocks pipeline when collision pre-scan finds an overlap', async () => {
    await withMappingFile(SAMPLE_MAPPING, async (mappingPath) => {
      const text = '张三丰创立太极拳, 张三是另一个人。'
      const result = await runPipelineFromText(text, mappingPath, true)

      expect(result.collisions.length).toBeGreaterThan(0)
      expect(result.collisions[0].shorter).toBe('张三')
      expect(result.collisions[0].longer).toContain('张三丰')

      // Output is the original text — pipeline did NOT proceed past collision gate.
      expect(result.output).toBe(text)
      expect(result.replacements).toEqual([])
    })
  })

  it('proceeds when both shorter and longer ARE in mapping (no collision)', async () => {
    const richMapping = `
version: 1
next_pseudonym_index: 3
patients:
  - patient_id: f-1
    real_name: 张三
    aliases: []
    pseudonym: 患者A
    date_mode: preserve
    additional_entities: []
  - patient_id: f-2
    real_name: 张三丰
    aliases: []
    pseudonym: 武术家A
    date_mode: preserve
    additional_entities: []
`
    await withMappingFile(richMapping, async (mappingPath) => {
      // 张三丰 followed by 是 (particle, in blacklist) and 张三 by 的 (particle).
      // Without jieba in collisionScan (W4 polish), the +1 heuristic only
      // suppresses extension across particles. With both names in the mapping
      // and particle-suffixed, neither should produce a collision flag.
      const text = '张三丰是张三的师傅。'
      const result = await runPipelineFromText(text, mappingPath, true)

      expect(result.collisions).toEqual([])
      expect(result.output).toContain('武术家A')
      expect(result.output).toContain('患者A')
      expect(result.output).not.toContain('张三')
    })
  })

  it('returns pass-through for empty mapping', async () => {
    const emptyMapping = `version: 1\nnext_pseudonym_index: 0\npatients: []\n`
    await withMappingFile(emptyMapping, async (mappingPath) => {
      const text = '完全没有任何映射的输入文本。'
      const result = await runPipelineFromText(text, mappingPath, true)

      expect(result.output).toBe(text)
      expect(result.replacements).toEqual([])
      expect(result.collisions).toEqual([])
    })
  })

  it('still applies regex even when no name mappings exist', async () => {
    const emptyMapping = `version: 1\nnext_pseudonym_index: 0\npatients: []\n`
    await withMappingFile(emptyMapping, async (mappingPath) => {
      const text = '身份证 11010519491231002X 主要联系 13812345678'
      const result = await runPipelineFromText(text, mappingPath, true)

      expect(result.output).toContain('[身份证号]')
      expect(result.output).toMatch(/\*+5678/)
      expect(result.replacements.every(r => r.reason === 'regex')).toBe(true)
    })
  })
})

describe('runPipeline — audit timings sanity', () => {
  it('total_ms >= max(regex_ms, mapping_ms) on a non-trivial input', async () => {
    await withMappingFile(SAMPLE_MAPPING, async (mappingPath) => {
      const text = '张三 入院, 联系 13812345678'
      const result = await runPipelineFromText(text, mappingPath, true)
      expect(result.timings.total_ms).toBeGreaterThanOrEqual(result.timings.regex_ms)
      expect(result.timings.total_ms).toBeGreaterThanOrEqual(result.timings.mapping_ms)
    })
  })
})

describe('runPipeline — error surfaces', () => {
  it('throws PipelineError for unreadable mapping path', async () => {
    await expect(
      runPipelineFromText('文本', '/nonexistent/mapping.md', true),
    ).rejects.toThrow(/Failed to load mapping/)
  })
})
