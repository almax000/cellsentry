#!/usr/bin/env node
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalSpec, stageRelease } from './lib/stage-model-package.mjs'

function usage() {
  throw new Error('Usage: node scripts/stage-formula-cancellation-v2.mjs --model /absolute/path/model.gguf --out-dir /absolute/path/new-empty-directory')
}

const values = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if ((key !== '--model' && key !== '--out-dir') || !value || values[key]) usage()
  values[key] = value
}
if (Object.keys(values).length !== 2 || !values['--model'] || !values['--out-dir']) usage()
if (!isAbsolute(values['--model']) || !isAbsolute(values['--out-dir'])) usage()

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const spec = await canonicalSpec(root)
const result = await stageRelease({
  modelPath: values['--model'],
  outDir: values['--out-dir'],
  spec,
  licensePath: resolve(root, 'model-artifacts/formula-cancellation-v2/LICENSE'),
  noticePath: resolve(root, 'model-artifacts/formula-cancellation-v2/NOTICE.txt'),
})
process.stdout.write(`${JSON.stringify({ release: result.manifest.release, out_dir: result.outDir, manifest_sha256: result.manifestSha256 })}\n`)
