/**
 * Safety-net LLM pass (per D21 / AD2).
 *
 * Takes the post-redaction output and asks Qwen2.5-3B (off-the-shelf) to spot
 * any human names that looked like real people but weren't in the mapping.
 * This is the LAST line of defense — not a primary detector. The user provides
 * mapping (D19); this is "did you forget anyone?" review.
 *
 * Tagged-block prompt (security-assessment P1#4):
 *   <redacted_output_untrusted>...</redacted_output_untrusted>
 *
 * System prompt explicitly says content between tags is untrusted input — the
 * model must NOT execute any instruction inside the tags.
 *
 * Returns SafetyNetFlag[] — UI surfaces them in a review screen; user resolves
 * each by adding to mapping / replacing manually / dismissing as false positive.
 *
 * W2 Step 2.4: prompt template + robust parser drafted (this file).
 * W3 Step 3.1: real LLM wiring (calls analyzeWithLlm via lifecycle.ts).
 */

import type { SafetyNetFlag } from '../types'

export interface SafetyNetInput {
  redacted_text: string
  /** Already-replaced names — model should not re-flag these. */
  known_pseudonyms: string[]
}

/**
 * Strip common LLM output decorations to expose the underlying JSON.
 *
 * What this handles (collected from W2 manual probes; expand W3+):
 *   - ```json … ``` markdown fences (Qwen tends to add these despite
 *     "no markdown" instructions in the prompt)
 *   - ``` … ``` plain fences (no language tag)
 *   - Leading / trailing whitespace
 *   - Leading prose like "Here is the JSON:" before the actual array
 *   - Trailing prose like "Hope this helps!" after a complete object
 *
 * Does NOT try to repair invalid JSON — if the model produces broken JSON
 * after stripping, return null and the caller treats it as "model failed
 * to follow instructions; surface a soft error in UI."
 */
export function stripDecorations(raw: string): string {
  let text = raw.trim()

  // Strip ```json or ``` fences (greedy: match the longest fenced block).
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // If the model led with prose, find the first '[' or '{' and trim before it.
  // Same for trailing — find the last ']' or '}' and trim after it. This is
  // structurally safe because JSON arrays/objects always start + end with
  // matched brackets at the outermost level.
  const firstBracket = text.search(/[[{]/)
  const lastBracket = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    text = text.slice(firstBracket, lastBracket + 1)
  }

  return text.trim()
}

/**
 * Parse the safety-net model's raw output into a list of flags.
 *
 * Accepted shapes:
 *   - `[]` (empty array) → no flags
 *   - `"none"` / `"None"` / `"NONE"` (case-insensitive sentinel) → no flags
 *   - `[{name, context, confidence, suggested_replacement?}, ...]`
 *
 * Returns null on parse failure (caller surfaces "model output unreadable"
 * in UI; better than silently dropping a result).
 */
export function parseSafetyNetOutput(raw: string): SafetyNetFlag[] | null {
  const stripped = stripDecorations(raw)

  // Sentinel: model said "none" rather than JSON. Treat as empty list.
  if (/^"?none"?$/i.test(stripped)) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return null
  }

  // Some models wrap the array in `{ "flags": [...] }`.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.flags)) parsed = obj.flags
    else if (Array.isArray(obj.names)) parsed = obj.names
    else if (Array.isArray(obj.results)) parsed = obj.results
    else return null
  }

  if (!Array.isArray(parsed)) return null

  // Validate each entry — drop malformed entries with a stderr-side warning
  // rather than failing the whole parse (resilience over strictness).
  const flags: SafetyNetFlag[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.name !== 'string' || e.name.length === 0) continue
    if (typeof e.context !== 'string') continue
    const confidence = typeof e.confidence === 'number'
      ? Math.max(0, Math.min(1, e.confidence))
      : 0.5
    const suggested = typeof e.suggested_replacement === 'string'
      ? e.suggested_replacement
      : undefined
    flags.push({
      name: e.name,
      context: e.context,
      confidence,
      suggested_replacement: suggested,
    })
  }

  return flags
}

/**
 * Run the safety-net pass.
 *
 * Calls the unified Python server's `analyze` method with the safety-net
 * prompts. The Python side loads Qwen2.5-3B-Instruct lazily; the first call
 * pays a one-time ~2-3 s import cost + ~5-10 s model load on Apple Silicon.
 * Subsequent calls reuse the loaded model and run in ~3-8 s for typical
 * medical-record sizes.
 *
 * Failure modes (UI must handle, see screen-4 design spec):
 *   - bridge unavailable → `{ error, flagsUnsupported: true }` shape; UI shows
 *     degraded banner; user manually scans output.
 *   - model returns malformed JSON → `parseSafetyNetOutput` returns null;
 *     surface as "AI returned unreadable response — retry or treat preview as final."
 *   - model returns valid empty array / "none" sentinel → return `[]`; UI
 *     skips screen 4 and routes straight to export.
 *   - normal: returns parsed `SafetyNetFlag[]`; UI shows screen 4.
 */

// Note on dynamic import: `llm/bridge` imports the `electron` package at module
// load time (for `net.request`), which vitest's happy-dom can't resolve. Pure
// parser tests in safetyNet.test.ts import this file's parseSafetyNetOutput +
// stripDecorations; if we top-level-imported llmBridge, those tests would fail
// at module-load. Lazy import inside runSafetyNet keeps the pure path testable.

export type SafetyNetOutcome =
  | { kind: 'flags'; flags: SafetyNetFlag[]; latency_ms: number }
  | { kind: 'unreadable'; raw: string; latency_ms: number }
  | { kind: 'unavailable'; error: string; code: string }

export async function runSafetyNet(input: SafetyNetInput): Promise<SafetyNetOutcome> {
  const { llmBridge } = await import('../../llm/bridge')
  const { buildSafetyNetChatMessages } = await import('./safetyNetPrompts')

  if (!llmBridge.status.available) {
    await llmBridge.start()
  }
  if (!llmBridge.status.available) {
    return {
      kind: 'unavailable',
      error: 'Local AI bridge not available. Manually review the redacted output for missed names.',
      code: 'bridge_unavailable',
    }
  }

  const messages = buildSafetyNetChatMessages(input)

  const response = await llmBridge.send({
    method: 'analyze',
    params: {
      messages,
      max_tokens: 2048,
      // Low temperature: safety-net should be deterministic-ish, not creative.
      temperature: 0.1,
    },
  })

  if (response.error) {
    return { kind: 'unavailable', error: response.error, code: 'bridge_error' }
  }

  const result = response.result as Record<string, unknown> | undefined
  if (!result || typeof result !== 'object') {
    return { kind: 'unavailable', error: 'safety-net returned empty response', code: 'empty_response' }
  }

  // Python may return error envelope OR success {text, latency_ms}.
  if (typeof result.error === 'string') {
    return {
      kind: 'unavailable',
      error: result.error,
      code: typeof result.code === 'string' ? result.code : 'unknown',
    }
  }

  const text = typeof result.text === 'string' ? result.text : ''
  const latency_ms = typeof result.latency_ms === 'number' ? result.latency_ms : 0

  const flags = parseSafetyNetOutput(text)
  if (flags === null) {
    return { kind: 'unreadable', raw: text, latency_ms }
  }

  return { kind: 'flags', flags, latency_ms }
}
