#!/usr/bin/env node
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalSpec, verifyReleaseDirectory } from './lib/stage-model-package.mjs'

if (process.argv.length !== 4 || process.argv[2] !== '--dir' || !isAbsolute(process.argv[3])) {
  throw new Error('Usage: node scripts/verify-formula-cancellation-v2-package.mjs --dir /absolute/path/package-directory')
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const result = await verifyReleaseDirectory({ outDir: process.argv[3], spec: await canonicalSpec(root) })
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
