#!/usr/bin/env node
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { canonicalSpec, verifyReleaseDirectory } from './lib/stage-model-package.mjs'
import { verifyPackagedNativeRuntime } from './lib/packaged-native-runtime.cjs'
import { offlineWindowsStoreConfig, readWindowsStoreIdentityProfile, validateWindowsStoreVersion } from './lib/offline-windows-store-config.mjs'

const { values } = parseArgs({ options: {
  'app-dir': { type: 'string' }, 'model-package': { type: 'string' }, 'native-dir': { type: 'string' },
  out: { type: 'string' }, 'identity-profile': { type: 'string' }, version: { type: 'string' },
} })
for (const key of ['app-dir', 'model-package', 'native-dir', 'out', 'identity-profile', 'version']) {
  if (!values[key]) throw new Error(`--${key} is required`)
}
for (const key of ['app-dir', 'model-package', 'native-dir', 'out', 'identity-profile']) {
  if (!isAbsolute(values[key])) throw new Error(`--${key} requires an absolute path`)
}

// Fail before hashing the large model if identity or version input is invalid.
const identity = await readWindowsStoreIdentityProfile(values['identity-profile'])
validateWindowsStoreVersion(values.version)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceApp = await realpath(join(root, 'app'))
const appDir = await realpath(values['app-dir'])
if (appDir === sourceApp) throw new Error('Do not package the source app directory; create an isolated staging copy')
const modules = await realpath(join(appDir, 'node_modules'))
if (!modules.startsWith(appDir + sep)) throw new Error('Use an isolated app staging directory with its own node_modules')
if (!(await lstat(join(appDir, 'out/main/index.js'))).isFile()) throw new Error('Build the application before creating the Store candidate')

const packageDir = await realpath(values['model-package'])
const nativeDir = await realpath(values['native-dir'])
// Resolve the existing parent too, so symlinked ancestors cannot put output
// inside an otherwise immutable input tree.
const outputDir = join(await realpath(dirname(values.out)), basename(values.out))
for (const inputDir of [appDir, packageDir, nativeDir]) {
  const outputRelation = relative(inputDir, outputDir)
  if (outputRelation === '' || (!isAbsolute(outputRelation) && !outputRelation.startsWith(`..${sep}`) && outputRelation !== '..')) {
    throw new Error('--out must be outside the application, model, and native input directories')
  }
}

// Verify before creating output: the candidate may be very large and must never
// be assembled from an incomplete or substituted model package.
await verifyReleaseDirectory({ outDir: packageDir, spec: await canonicalSpec(root) })
await verifyPackagedNativeRuntime(nativeDir)
const runtime = JSON.parse(await readFile(join(nativeDir, 'runtime.json'), 'utf8'))
if (runtime.target !== 'win32-x64' || !runtime.executable.endsWith('.exe')) {
  throw new Error('Store candidate requires the prepared win32-x64 native runtime')
}
const config = offlineWindowsStoreConfig({ appDir, modelPackageDir: packageDir, nativeDir, outputDir, identity, version: values.version })

await mkdir(outputDir) // Never overwrite an existing Store candidate directory.
const configPath = join(outputDir, 'offline-store.json')
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({
  cwd: appDir,
  config: configPath,
  publish: 'never',
  executable: 'npx',
  args: ['electron-builder', '--config', configPath, '--win', '--x64', '--publish', 'never'],
  note: 'This config validates only supplied public identity strings; Microsoft Store identity approval, account verification, signing, certification, IAP and updates remain separate gates.',
}, null, 2))
