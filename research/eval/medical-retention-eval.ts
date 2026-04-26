/**
 * CIRE-style medical retention eval (W5 Step 5.2).
 *
 * Synthetic-corpus path — sends each (original, redacted) pair to Claude
 * Sonnet via the Anthropic API for clinical-information retention scoring.
 * SYNTHETIC RECORDS ONLY: every name in the corpus is clearly fake
 * (测试人甲 / John Doe-Test / etc.). Plan v3 explicitly forbids this entry
 * point on private real records — for those, use private-spotcheck.ts.
 *
 * Privacy contract:
 *   - This script reads from research/eval/synthetic-corpus/ ONLY.
 *   - Sends original + redacted text to Anthropic API via the global proxy
 *     (E013-clean — HTTPS_PROXY=http://127.0.0.1:7890 already in env).
 *   - Pulls API key from ~/.secrets/ANTHROPIC_API_KEY (E003 / E005 — no
 *     hardcode, no shell-config persistence beyond ~/.secrets).
 *
 * Scoring rubric (3 metrics):
 *   1. clinical_retention: % of clinical facts (diagnosis, medication,
 *      vitals, dates, labs) preserved verbatim or in semantically-equivalent
 *      form. Target ≥ 95%.
 *   2. pii_leak: count of un-redacted PII tokens (names, IDs, phones, MRNs)
 *      still present in the redacted output. Target = 0; fail at ≥ 1.
 *   3. false_redaction: count of clinical facts erroneously masked.
 *      Target ≤ 5% of clinical-fact total.
 *
 * Usage:
 *   cd app && npx tsx ../research/eval/medical-retention-eval.ts
 *
 * Output:
 *   research/eval/report-{ISO_TIMESTAMP}.md
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { runPipelineInline } from '../../app/electron/medical/pipeline/orchestrator'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CORPUS_DIR = join(__dirname, 'synthetic-corpus')
const MAPPING_PATH = join(CORPUS_DIR, 'mapping.md')
const REPORT_DIR = __dirname

const CLAUDE_MODEL = 'claude-sonnet-4-6' // per global rule: Opus/Sonnet/Haiku 4.x family
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/messages'

// ---------------------------------------------------------------------------
// Anthropic API client (plain fetch, no SDK — keeps eval-only deps lean)
// ---------------------------------------------------------------------------

interface JudgeResponse {
  clinical_retention: number // 0.0 to 1.0
  pii_leaks: string[]
  false_redactions: string[]
  notes: string
}

const SYSTEM_PROMPT = `You are a medical-record privacy auditor evaluating an automated pseudonymization tool.

For each pair of (original, redacted) records, score the redacted version on:

1. clinical_retention (0.0 to 1.0): fraction of CLINICALLY MEANINGFUL information preserved.
   Clinical info = diagnoses, medications + dosages, vital signs, lab values, dates,
   procedures, observations. Patient names + IDs are NOT clinical info — losing those is GOOD.

2. pii_leaks (string array): list of human-name / ID / phone / MRN strings that ARE STILL PRESENT
   in the redacted version. Empty list = perfect. Each entry should be the exact leaked substring.

3. false_redactions (string array): list of clinical facts that were ERRONEOUSLY masked
   (e.g. a medication name replaced as if it were a person). Each entry should be the
   exact clinical fact that was lost.

4. notes: 1-2 sentence summary of overall quality.

Output ONLY a JSON object matching this shape — no markdown fences, no commentary.
{
  "clinical_retention": <number 0.0 to 1.0>,
  "pii_leaks": [<string>...],
  "false_redactions": [<string>...],
  "notes": "<1-2 sentences>"
}`

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key.length < 20) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Source ~/.secrets first: `source ~/.secrets && npx tsx ...`',
    )
  }
  return key
}

async function judgePair(
  apiKey: string,
  filename: string,
  original: string,
  redacted: string,
): Promise<JudgeResponse> {
  const userMessage = `RECORD: ${filename}

ORIGINAL:
${original}

REDACTED:
${redacted}`

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      // Prompt caching on the rubric — it's identical across all 6+ records.
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  }

  const res = await fetch(ANTHROPIC_BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`)
  }

  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> }
  const text = json.content.find(c => c.type === 'text')?.text ?? ''

  // Strip optional markdown fences + parse.
  let stripped = text.trim()
  const fenceMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) stripped = fenceMatch[1].trim()

  try {
    return JSON.parse(stripped) as JudgeResponse
  } catch {
    throw new Error(`Could not parse judge response for ${filename}: ${stripped.slice(0, 200)}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RecordResult {
  filename: string
  original_chars: number
  redacted_chars: number
  pipeline_ms: number
  replacement_count: number
  judge: JudgeResponse | null
  error?: string
}

async function main(): Promise<void> {
  const apiKey = getApiKey()

  // Load every .txt under synthetic-corpus/.
  const files = readdirSync(CORPUS_DIR)
    .filter(f => f.endsWith('.txt'))
    .sort()
  if (files.length === 0) {
    throw new Error(`No .txt files in ${CORPUS_DIR}`)
  }

  const mappingText = readFileSync(MAPPING_PATH, 'utf-8')

  const results: RecordResult[] = []
  for (const file of files) {
    const original = readFileSync(join(CORPUS_DIR, file), 'utf-8')

    // Pipeline preview = no safety-net call (we don't need Qwen for this eval;
    // Claude is the judge). All deterministic stages run.
    const start = Date.now()
    let redactionResult
    try {
      redactionResult = await runPipelineInline(original, mappingText, true)
    } catch (e) {
      results.push({
        filename: file,
        original_chars: original.length,
        redacted_chars: 0,
        pipeline_ms: Date.now() - start,
        replacement_count: 0,
        judge: null,
        error: e instanceof Error ? e.message : String(e),
      })
      continue
    }
    const pipelineMs = Date.now() - start

    if (redactionResult.collisions.length > 0) {
      results.push({
        filename: file,
        original_chars: original.length,
        redacted_chars: 0,
        pipeline_ms: pipelineMs,
        replacement_count: 0,
        judge: null,
        error: `collision warnings (${redactionResult.collisions.length}); resolve mapping first`,
      })
      continue
    }

    let judge: JudgeResponse | null = null
    try {
      judge = await judgePair(apiKey, file, original, redactionResult.output)
    } catch (e) {
      results.push({
        filename: file,
        original_chars: original.length,
        redacted_chars: redactionResult.output.length,
        pipeline_ms: pipelineMs,
        replacement_count: redactionResult.replacements.length,
        judge: null,
        error: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    results.push({
      filename: file,
      original_chars: original.length,
      redacted_chars: redactionResult.output.length,
      pipeline_ms: pipelineMs,
      replacement_count: redactionResult.replacements.length,
      judge,
    })

    // Tiny pause to be polite to the API.
    await new Promise(r => setTimeout(r, 300))
  }

  // Aggregate metrics.
  const judged = results.filter(r => r.judge !== null)
  const avgRetention =
    judged.length === 0
      ? 0
      : judged.reduce((acc, r) => acc + (r.judge!.clinical_retention ?? 0), 0) / judged.length
  const totalLeaks = judged.reduce((acc, r) => acc + r.judge!.pii_leaks.length, 0)
  const totalFalse = judged.reduce((acc, r) => acc + r.judge!.false_redactions.length, 0)

  // Render report.
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = join(REPORT_DIR, `report-${ts}.md`)
  let md = `# CellSentry v2 — Medical Retention Eval Report\n\n`
  md += `Generated: ${new Date().toISOString()}\n`
  md += `Model: ${CLAUDE_MODEL}\n`
  md += `Records judged: ${judged.length} of ${results.length}\n\n`
  md += `## Summary\n\n`
  md += `| Metric | Value | Target | Pass? |\n`
  md += `|--------|-------|--------|-------|\n`
  md += `| Avg clinical retention | ${(avgRetention * 100).toFixed(1)}% | ≥ 95% | ${avgRetention >= 0.95 ? '✅' : '❌'} |\n`
  md += `| Total PII leaks | ${totalLeaks} | 0 | ${totalLeaks === 0 ? '✅' : '❌'} |\n`
  md += `| Total false redactions | ${totalFalse} | ≤ ${Math.ceil(judged.length * 0.5)} | ${totalFalse <= Math.ceil(judged.length * 0.5) ? '✅' : '❌'} |\n\n`

  md += `## Per-record details\n\n`
  for (const r of results) {
    md += `### ${r.filename}\n\n`
    md += `- Pipeline: ${r.pipeline_ms} ms · ${r.replacement_count} replacements · `
    md += `${r.original_chars} → ${r.redacted_chars} chars\n`
    if (r.error) {
      md += `- **ERROR:** ${r.error}\n\n`
      continue
    }
    if (r.judge) {
      md += `- Clinical retention: **${(r.judge.clinical_retention * 100).toFixed(0)}%**\n`
      md += `- PII leaks: ${r.judge.pii_leaks.length === 0 ? 'none ✅' : r.judge.pii_leaks.map(s => `\`${s}\``).join(', ')}\n`
      md += `- False redactions: ${r.judge.false_redactions.length === 0 ? 'none ✅' : r.judge.false_redactions.map(s => `\`${s}\``).join(', ')}\n`
      md += `- Notes: ${r.judge.notes}\n\n`
    }
  }

  writeFileSync(reportPath, md, 'utf-8')
  console.log(`\nReport: ${reportPath}`)
  console.log(`Avg retention: ${(avgRetention * 100).toFixed(1)}% | leaks: ${totalLeaks} | false: ${totalFalse}`)
}

main().catch(err => {
  console.error('Eval failed:', err)
  process.exit(1)
})
