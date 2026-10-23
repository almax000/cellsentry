#!/usr/bin/env node
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { canonicalSpec, verifyReleaseDirectory } from './lib/stage-model-package.mjs'
import { offlineMacConfigs, requireMacNotarization } from './lib/offline-mac-config.mjs'

const { values } = parseArgs({ options: {
  'app-dir': { type: 'string' }, 'model-package': { type: 'string' },
  'native-dir': { type: 'string' }, out: { type: 'string' },
  release: { type: 'boolean', default: false },
} })
for (const key of ['app-dir', 'model-package', 'native-dir', 'out']) {
  if (!values[key] || !isAbsolute(values[key])) throw new Error(`--${key} requires an absolute path`)
}
// Fail before staging or hashing a 1.56 GB payload. Authentication validity is still checked by Apple.
const notarizationMode = values.release ? requireMacNotarization() : undefined
const appDir = await realpath(values['app-dir'])
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (appDir === join(root, 'app')) throw new Error('Do not package the source app directory; create an isolated staging copy')
const modules = await realpath(join(appDir, 'node_modules'))
if (!modules.startsWith(appDir + sep)) throw new Error('Use an isolated app staging directory with its own node_modules')
const packageDir = await realpath(values['model-package'])
const nativeDir = await realpath(values['native-dir'])
if (!(await lstat(join(appDir, 'out/main/index.js'))).isFile()) throw new Error('Build the application before staging')
if (!(await lstat(join(nativeDir, 'runtime.json'))).isFile()) throw new Error('Prepare the native runtime first')
const require = createRequire(join(appDir, 'package.json'))
const baseConfig = require('js-yaml').load(await readFile(join(root, 'app/electron-builder.yml'), 'utf8'))
const outputRoot = values.out
const configs = offlineMacConfigs({ baseConfig, appDir, nativeDir, packageDir, outputRoot, release: values.release })
await verifyReleaseDirectory({ outDir: packageDir, spec: await canonicalSpec(root) })
await mkdir(outputRoot) // Never overwrite an existing candidate.
for (const [name, config] of Object.entries(configs)) {
  await writeFile(join(outputRoot, `${name}.json`), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
}
console.log(JSON.stringify({ cwd: appDir, configs: ['offline.json', 'update.json'].map(name => join(outputRoot, name)),
  publish: 'never', release: values.release, notarizationMode,
  note: values.release
    ? 'Build serially with electron-builder --config <path> --mac --publish never. Verify actual Developer ID signatures, Apple acceptance and stapled tickets before publishing.'
    : 'Build serially with electron-builder --config <path> --mac --publish never; unsigned local candidates also require explicit identity=null and notarize=false.' }, null, 2))
