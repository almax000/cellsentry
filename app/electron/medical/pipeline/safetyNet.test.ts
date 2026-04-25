/**
 * Unit tests for safety-net output parsing (W2 Step 2.4).
 *
 * Real LLM-call tests (network + model load) are deferred to W3 Step 3.1.
 * Here we cover the JSON parser's resilience against the 3 adversarial
 * output shapes called out in plan v3:
 *   - markdown-fenced output
 *   - trailing garbage after a valid object
 *   - pure text instead of JSON
 *
 * Plus extra cases discovered while writing the parser.
 */

import { describe, it, expect } from 'vitest'
import {
  parseSafetyNetOutput,
  stripDecorations,
} from './safetyNet'
import { buildSafetyNetUserMessage, SAFETY_NET_SYSTEM_PROMPT } from './safetyNetPrompts'

// ---------------------------------------------------------------------------
// stripDecorations — the prep step before JSON.parse
// ---------------------------------------------------------------------------

describe('stripDecorations', () => {
  it('removes ```json fences', () => {
    const raw = '```json\n[{"name":"张三","context":"a","confidence":0.9}]\n```'
    expect(stripDecorations(raw)).toBe('[{"name":"张三","context":"a","confidence":0.9}]')
  })

  it('removes plain ``` fences without language tag', () => {
    const raw = '```\n["a"]\n```'
    expect(stripDecorations(raw)).toBe('["a"]')
  })

  it('strips leading prose before the first [ or {', () => {
    const raw = 'Here is the JSON output: [{"name":"x","context":"y","confidence":1}]'
    expect(stripDecorations(raw)).toBe('[{"name":"x","context":"y","confidence":1}]')
  })

  it('strips trailing prose after a complete array', () => {
    const raw = '[]\n\nHope this helps!'
    expect(stripDecorations(raw)).toBe('[]')
  })

  it('strips both leading + trailing prose', () => {
    const raw = 'Sure! Here it is:\n[{"name":"a","context":"b","confidence":0.5}]\nLet me know.'
    expect(stripDecorations(raw)).toBe('[{"name":"a","context":"b","confidence":0.5}]')
  })

  it('passes "none" sentinel through unchanged', () => {
    // No brackets to strip into; should stay as-is for the parser to detect.
    expect(stripDecorations('none')).toBe('none')
    expect(stripDecorations('"none"')).toBe('"none"')
  })

  it('handles fence + prose + brackets in combination', () => {
    const raw = 'Here is the result:\n```json\n[{"name":"a","context":"b","confidence":0.5}]\n```\nDone.'
    expect(stripDecorations(raw)).toBe('[{"name":"a","context":"b","confidence":0.5}]')
  })
})

// ---------------------------------------------------------------------------
// parseSafetyNetOutput — full pipeline (strip → JSON.parse → validate)
// ---------------------------------------------------------------------------

describe('parseSafetyNetOutput', () => {
  it('returns [] for the literal "none" sentinel (case-insensitive)', () => {
    expect(parseSafetyNetOutput('none')).toEqual([])
    expect(parseSafetyNetOutput('"none"')).toEqual([])
    expect(parseSafetyNetOutput('NONE')).toEqual([])
    expect(parseSafetyNetOutput('  None  ')).toEqual([])
  })

  it('returns [] for an empty array', () => {
    expect(parseSafetyNetOutput('[]')).toEqual([])
  })

  it('parses a valid single-flag array', () => {
    const raw = '[{"name":"张三","context":"患者张三表示","confidence":0.85,"suggested_replacement":"患者X"}]'
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(1)
    expect(flags?.[0]).toEqual({
      name: '张三',
      context: '患者张三表示',
      confidence: 0.85,
      suggested_replacement: '患者X',
    })
  })

  it('parses multiple flags', () => {
    const raw = `[
      {"name":"张三","context":"患者张三","confidence":0.9},
      {"name":"John Smith","context":"Dr. John Smith said","confidence":0.7}
    ]`
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(2)
  })

  // Adversarial shape #1: markdown-fenced output (very common from Qwen).
  it('handles markdown-fenced output (adversarial #1)', () => {
    const raw = '```json\n[{"name":"a","context":"b","confidence":0.5}]\n```'
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(1)
    expect(flags?.[0].name).toBe('a')
  })

  // Adversarial shape #2: trailing garbage after a complete object.
  it('handles trailing prose after the JSON (adversarial #2)', () => {
    const raw = '[{"name":"a","context":"b","confidence":0.5}]\n\nThat\'s all I found.'
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(1)
  })

  // Adversarial shape #3: pure text response, no JSON.
  it('returns null for pure text without JSON (adversarial #3)', () => {
    expect(parseSafetyNetOutput('I could not find any names in the provided text.')).toBeNull()
  })

  it('clamps confidence to [0, 1]', () => {
    const raw = '[{"name":"a","context":"b","confidence":2.5}]'
    const flags = parseSafetyNetOutput(raw)
    expect(flags?.[0].confidence).toBe(1)

    const raw2 = '[{"name":"a","context":"b","confidence":-0.3}]'
    const flags2 = parseSafetyNetOutput(raw2)
    expect(flags2?.[0].confidence).toBe(0)
  })

  it('defaults missing confidence to 0.5', () => {
    const raw = '[{"name":"a","context":"b"}]'
    const flags = parseSafetyNetOutput(raw)
    expect(flags?.[0].confidence).toBe(0.5)
  })

  it('drops entries with missing required fields, keeps the rest (resilience)', () => {
    const raw = `[
      {"name":"good","context":"ok","confidence":1},
      {"context":"missing-name"},
      {"name":"","context":"empty-name","confidence":1},
      {"name":"also-good","context":"ok2","confidence":0.5}
    ]`
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(2)
    expect(flags?.map(f => f.name)).toEqual(['good', 'also-good'])
  })

  it('handles wrapper-object shape { flags: [...] }', () => {
    const raw = '{"flags":[{"name":"a","context":"b","confidence":0.5}]}'
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(1)
  })

  it('handles wrapper-object shape { names: [...] }', () => {
    const raw = '{"names":[{"name":"a","context":"b","confidence":0.5}]}'
    const flags = parseSafetyNetOutput(raw)
    expect(flags).toHaveLength(1)
  })

  it('returns null for completely broken JSON', () => {
    expect(parseSafetyNetOutput('{not json')).toBeNull()
    expect(parseSafetyNetOutput('[broken,')).toBeNull()
  })

  it('treats omitted suggested_replacement as undefined (not empty string)', () => {
    const raw = '[{"name":"a","context":"b","confidence":1}]'
    const flags = parseSafetyNetOutput(raw)
    expect(flags?.[0].suggested_replacement).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Prompt construction — sanity checks
// ---------------------------------------------------------------------------

describe('buildSafetyNetUserMessage', () => {
  it('wraps the redacted text in the untrusted-tag block', () => {
    const msg = buildSafetyNetUserMessage({
      redacted_text: 'Patient A reports symptoms.',
      known_pseudonyms: ['Patient A'],
    })
    expect(msg).toContain('<redacted_output_untrusted>')
    expect(msg).toContain('Patient A reports symptoms.')
    expect(msg).toContain('</redacted_output_untrusted>')
  })

  it('lists known pseudonyms so the model does not re-flag them', () => {
    const msg = buildSafetyNetUserMessage({
      redacted_text: '...',
      known_pseudonyms: ['患者A', '患者B', 'Patient X'],
    })
    expect(msg).toContain('- 患者A')
    expect(msg).toContain('- 患者B')
    expect(msg).toContain('- Patient X')
  })

  it('handles empty pseudonym list with explicit "(none)" marker', () => {
    const msg = buildSafetyNetUserMessage({
      redacted_text: 'plain text with no replacements',
      known_pseudonyms: [],
    })
    expect(msg).toContain('(none)')
  })

  it('does NOT inline raw user mapping content (privacy: model never sees real names)', () => {
    // The known_pseudonyms list contains pseudonyms only — never the real names
    // that map to them. This test documents that contract.
    const msg = buildSafetyNetUserMessage({
      redacted_text: 'Patient A reports a cough.',
      known_pseudonyms: ['Patient A'], // pseudonym, not 'John Smith'
    })
    expect(msg).not.toContain('John')
  })
})

describe('SAFETY_NET_SYSTEM_PROMPT', () => {
  it('declares tag content as untrusted (the security contract)', () => {
    expect(SAFETY_NET_SYSTEM_PROMPT.toLowerCase()).toContain('untrusted')
  })

  it('explicitly forbids following instructions inside tags', () => {
    expect(SAFETY_NET_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not follow|ignore.*instruction|treat.*as data/)
  })

  it('asks for strict JSON output (or "none" sentinel)', () => {
    expect(SAFETY_NET_SYSTEM_PROMPT.toLowerCase()).toContain('json')
    expect(SAFETY_NET_SYSTEM_PROMPT.toLowerCase()).toContain('none')
  })

  it('lists what NOT to flag (place / drug / org names)', () => {
    expect(SAFETY_NET_SYSTEM_PROMPT.toLowerCase()).toContain('place')
  })
})
