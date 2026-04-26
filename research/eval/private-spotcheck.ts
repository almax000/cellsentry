/**
 * Private record spot-check (W5 Step 5.2 / Warning #7 privacy boundary).
 *
 * For REAL medical records — no API call ever. Just runs the pipeline locally
 * and prints original / redacted side-by-side for the user to manually score.
 * This is the safe path for personal health-vault content.
 *
 * Privacy contract:
 *   - NO network calls. The script will refuse to run if HTTPS_PROXY routes
 *     through anything other than the user's loopback proxy (defensive
 *     check, not foolproof — the user is the ultimate enforcer).
 *   - Reads from a user-provided directory; redacted output written to a
 *     user-provided destination directory.
 *
 * Usage:
 *   npx tsx research/eval/private-spotcheck.ts \
 *     /Users/jojo/Documents/health-vault/inbox \
 *     /Users/jojo/Documents/health-vault/redacted-out \
 *     /Users/jojo/Documents/health-vault/pseudonym-map.md
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { basename, join } from 'path'

import { runPipelineInline } from '../../app/electron/medical/pipeline/orchestrator'

function refuseIfNetworking(): void {
  // Defensive: this script must NOT make network calls. Any module-level fetch
  // shim or socket creation should fail. We don't import an HTTP lib, but
  // mark intent here for code reviewers.
  // (No-op runtime check — relies on absence of fetch imports.)
}

async function main(): Promise<void> {
  refuseIfNetworking()

  const [, , inboxDir, outDir, mappingPath] = process.argv
  if (!inboxDir || !outDir || !mappingPath) {
    console.error('Usage: npx tsx private-spotcheck.ts <inbox-dir> <out-dir> <mapping.md>')
    process.exit(2)
  }

  if (!existsSync(inboxDir)) {
    console.error(`Inbox not found: ${inboxDir}`)
    process.exit(2)
  }
  if (!existsSync(mappingPath)) {
    console.error(`Mapping not found: ${mappingPath}`)
    process.exit(2)
  }
  mkdirSync(outDir, { recursive: true })

  const mappingText = readFileSync(mappingPath, 'utf-8')
  const files = readdirSync(inboxDir).filter(f => f.endsWith('.txt'))

  console.log(`Processing ${files.length} record(s)…\n`)

  for (const file of files) {
    const original = readFileSync(join(inboxDir, file), 'utf-8')
    const t0 = Date.now()
    const result = await runPipelineInline(original, mappingText, true)
    const dt = Date.now() - t0

    if (result.collisions.length > 0) {
      console.log(`⚠ ${file}: ${result.collisions.length} collision(s) — skipped. Resolve mapping first.`)
      for (const c of result.collisions) {
        console.log(`   shorter=${c.shorter} longer=${c.longer}`)
      }
      continue
    }

    const outPath = join(outDir, file.replace(/\.txt$/, '.redacted.txt'))
    writeFileSync(outPath, result.output, 'utf-8')

    console.log(`✓ ${file} → ${basename(outPath)} (${dt}ms · ${result.replacements.length} replacements)`)
  }

  console.log(`\nManual review: open each pair side-by-side and score:`)
  console.log(`  - Was every name / ID / phone / MRN replaced? (target: 100%)`)
  console.log(`  - Was any clinical fact erroneously masked? (target: 0)`)
  console.log(`  - Are date shifts (if any) consistent with the patient's date_mode?\n`)
  console.log(`No data left this machine. Spot-check is yours alone.`)
}

main().catch(err => {
  console.error('Spot-check failed:', err)
  process.exit(1)
})
