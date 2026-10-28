#!/usr/bin/env node
// CI development identity only; model pins share the production verifier.
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalSpec, stageRelease, verifyReleaseDirectory } from './lib/stage-model-package.mjs'

const args = process.argv.slice(2)
if (args.length !== 4 || args[0] !== '--model-dir' || args[2] !== '--out') {
  throw new Error('Usage: node scripts/prepare-msix-model-probe.mjs --model-dir <verified source> --out <new directory>')
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(args[1])
const outDir = resolve(args[3])
const spec = await canonicalSpec(root)
await verifyReleaseDirectory({ outDir: source, spec })
// stageRelease creates a new directory and never overwrites an existing target.
await stageRelease({ modelPath: join(source, spec.model.name), licensePath: join(source, spec.license.name), noticePath: join(source, spec.notice.name), outDir, spec })
const verified = await verifyReleaseDirectory({ outDir, spec })
console.log(JSON.stringify({ target: outDir, files: verified.assets }))
