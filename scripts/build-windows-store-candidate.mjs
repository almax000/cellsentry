#!/usr/bin/env node
// Assemble an unsigned, offline MSIX candidate. This intentionally has no
// Store upload, certificate, signing, or purchase code path.
import { constants, createWriteStream } from 'node:fs'
import { access, copyFile, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Transform, Writable } from 'node:stream'
import { artifacts, digest as nativeDigest, version as nativeVersion } from './native-artifacts.mjs'
import { canonicalSpec, expectedPackageFiles, verifyReleaseDirectory } from './lib/stage-model-package.mjs'
import { verifyPackagedNativeRuntime } from './lib/packaged-native-runtime.cjs'
import { assertCandidateInputs, assertExactFileInventory, assertSafeArchivePaths, buildCandidateReceipt, commitCandidateReceipt, fingerprintDirectory, hashFile, validateAppxIdentity } from './lib/windows-store-provenance.mjs'
import { readWindowsStoreIdentityProfile } from './lib/offline-windows-store-config.mjs'

const MAX_NATIVE_ENTRY_BYTES = 2 ** 31
const MAX_NATIVE_TOTAL_BYTES = 4 * 2 ** 30
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT_PATHS = [
  'app', 'scripts/prepare-offline-windows-store-build.mjs',
  'scripts/lib/offline-windows-store-config.mjs', 'scripts/lib/stage-model-package.mjs',
  'scripts/lib/packaged-native-runtime.cjs', 'scripts/lib/windows-store-provenance.mjs',
  'scripts/build-windows-store-candidate.mjs', 'model-artifacts/formula-cancellation-v2-manifest.json',
  'scripts/native-artifacts.mjs', 'native/LLAMA-LICENSE',
]

function fail(message) { throw new Error(message) }
function run(command, args, { cwd, capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, shell: false, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
    let stdout = '', stderr = ''
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}${capture ? `: ${stderr.trim()}` : ''}`)))
  })
}

async function exists(path) { try { await access(path); return true } catch { return false } }
async function findOne(rootPath, predicate) {
  const found = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && predicate(path)) found.push(path)
    }
  }
  await walk(rootPath)
  if (found.length !== 1) fail(`Expected exactly one candidate package, found ${found.length}`)
  return found[0]
}

async function regularFile(path) { try { return (await lstat(path)).isFile() } catch { return false } }
async function npmCliPath(explicit, appDir) {
  if (explicit) {
    if (!(await regularFile(explicit))) throw new Error('--npm-cli must name an existing regular npm-cli.js file')
    return explicit
  }
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')].filter(Boolean)
  const require = createRequire(join(appDir, 'package.json'))
  try { candidates.push(require.resolve('npm/bin/npm-cli.js')) } catch {}
  for (const candidate of candidates) if (await regularFile(candidate)) return candidate
  throw new Error('Could not locate an npm CLI; pass --npm-cli with an absolute npm-cli.js path')
}

async function gitText(sourceRoot, args) { return (await run('git', args, { cwd: sourceRoot, capture: true })).stdout.trim() }
async function snapshotSource(sourceRoot, sourceCommit, destination) {
  const archive = join(dirname(destination), 'source.tar')
  await run('git', ['archive', '--format=tar', `--output=${archive}`, sourceCommit, '--', ...SNAPSHOT_PATHS], { cwd: sourceRoot })
  await mkdir(destination)
  await run('tar', ['-xf', archive, '-C', destination])
  await rm(archive, { force: true })
  return destination
}

export async function copyVerifiedModel(source, target, snapshotRoot) {
  const spec = await canonicalSpec(snapshotRoot)
  await verifyReleaseDirectory({ outDir: source, spec })
  await mkdir(dirname(target), { recursive: true })
  await mkdir(target)
  for (const entry of expectedPackageFiles(spec)) await copyFile(join(source, entry.name), join(target, entry.name), constants.COPYFILE_EXCL)
  await verifyReleaseDirectory({ outDir: target, spec })
  return fingerprintDirectory(target)
}

function zipEntryType(entry) {
  const attributes = entry.externalFileAttributes ?? entry.vars?.externalFileAttributes ?? 0
  if (((attributes >>> 16) & 0o170000) === 0o120000) return 'symlink'
  if (entry.type === 'File') return 'file'
  if (entry.type === 'Directory') return 'directory'
  return 'other'
}
async function consumeZipEntry(entry, limit, { output, counter } = {}) {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limit) fail(`ZIP entry exceeds limit: ${entry.path}`)
  const hash = createHash('sha256')
  let bytes = 0
  await pipeline(entry.stream(), new Transform({ transform(chunk, _, done) {
    bytes += chunk.length
    if (counter) counter.bytes += chunk.length
    if (bytes > Math.min(limit, entry.uncompressedSize) || (counter && counter.bytes > 8 * 2 ** 30)) done(new Error(`ZIP stream exceeds limit: ${entry.path}`))
    else { hash.update(chunk); done(null, chunk) }
  } }), output ? createWriteStream(output, { flags: 'wx' }) : new Writable({ write(_chunk, _encoding, done) { done() } }))
  if (bytes !== entry.uncompressedSize) fail(`ZIP stream size mismatch: ${entry.path}`)
  return { bytes, sha256: hash.digest('hex') }
}
async function readZipEntry(entry, limit) {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limit) fail(`ZIP entry exceeds limit: ${entry.path}`)
  const chunks = []
  let bytes = 0
  await pipeline(entry.stream(), new Writable({ write(chunk, _, done) { bytes += chunk.length; if (bytes > limit) done(new Error(`ZIP stream exceeds limit: ${entry.path}`)); else { chunks.push(chunk); done() } } }))
  if (bytes !== entry.uncompressedSize) fail(`ZIP stream size mismatch: ${entry.path}`)
  return Buffer.concat(chunks, bytes)
}
async function streamZipEntryToFile(entry, path, limit) {
  return consumeZipEntry(entry, limit, { output: path })
}
async function extractNativeZip(zipPath, target, appDir, snapshotRoot) {
  const require = createRequire(join(appDir, 'package.json'))
  const unzipper = require('unzipper')
  const archive = await unzipper.Open.file(zipPath)
  const entries = archive.files.map(entry => ({ path: entry.path, type: zipEntryType(entry) }))
  assertSafeArchivePaths(entries)
  let total = 0
  await mkdir(dirname(target), { recursive: true })
  await mkdir(target)
  for (const entry of archive.files) {
    if (entry.type === 'Directory') continue
    if (entry.type !== 'File' || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_NATIVE_ENTRY_BYTES) fail(`Unsafe native ZIP entry: ${entry.path}`)
    total += entry.uncompressedSize
    if (total > MAX_NATIVE_TOTAL_BYTES) fail('Native ZIP exceeds candidate extraction limit')
    const destination = resolve(target, entry.path)
    if (relative(target, destination).startsWith(`..${sep}`) || !relative(target, destination)) fail(`Native ZIP path escapes target: ${entry.path}`)
    await mkdir(dirname(destination), { recursive: true })
    await streamZipEntryToFile(entry, destination, Math.min(entry.uncompressedSize, MAX_NATIVE_ENTRY_BYTES))
  }
  async function findServer(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === 'llama-server.exe') return path
      if (entry.isDirectory()) { const found = await findServer(path); if (found) return found }
    }
  }
  const server = await findServer(target)
  if (!server) fail('Native ZIP contains no llama-server.exe')
  const license = join(snapshotRoot, 'native', 'LLAMA-LICENSE')
  await copyFile(license, join(target, 'LLAMA-LICENSE'), constants.COPYFILE_EXCL)
  const archiveSha256 = await nativeDigest(zipPath)
  const runtime = { version: nativeVersion, target: 'win32-x64', executable: relative(target, server).replaceAll('\\', '/'), archiveSha256 }
  await writeFile(join(target, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n', { flag: 'wx' })
  await verifyPackagedNativeRuntime(target)
  await run(server, ['--version'], { cwd: target })
  return fingerprintDirectory(target)
}

function parseManifest(xml, require) {
  const { SaxesParser } = require('saxes')
  const foundation = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10'
  const restricted = `${foundation}/restrictedcapabilities`
  const manifest = { fullTrust: false, fullTrustCapability: false }
  const stack = []
  let identities = 0, applications = 0, displayName = ''
  const parser = new SaxesParser({ xmlns: true })
  parser.on('opentag', node => {
    const parent = stack.at(-1)
    if (!stack.length && (node.local !== 'Package' || node.uri !== foundation)) fail('Invalid AppX manifest Package namespace')
    const attribute = name => node.attributes[name]?.value
    if (node.local === 'Identity' && node.uri === foundation && stack.length === 1 && parent?.uri === foundation) {
      if (++identities !== 1) fail('Duplicate AppX Identity')
      Object.assign(manifest, { name: attribute('Name'), publisher: attribute('Publisher'), version: attribute('Version'), processorArchitecture: attribute('ProcessorArchitecture') })
    }
    if (node.local === 'Application' && node.uri === foundation && stack.length === 2 && parent?.local === 'Applications' && parent.uri === foundation) {
      if (++applications !== 1) fail('Expected one AppX application')
      Object.assign(manifest, { fullTrust: attribute('EntryPoint') === 'Windows.FullTrustApplication', applicationId: attribute('Id'), applicationExecutable: attribute('Executable')?.replaceAll('\\', '/') })
    }
    if (node.local === 'Capability' && node.uri === restricted && stack.length === 2 && parent?.local === 'Capabilities' && parent.uri === foundation && attribute('Name') === 'runFullTrust') manifest.fullTrustCapability = true
    stack.push(node)
  })
  parser.on('text', text => {
    if (stack.length === 3 && stack.at(-1)?.local === 'PublisherDisplayName' && stack.at(-1)?.uri === foundation && stack.at(-2)?.local === 'Properties' && stack.at(-2)?.uri === foundation) displayName += text
  })
  parser.on('closetag', () => { stack.pop() })
  parser.write(xml).close()
  manifest.publisherDisplayName = displayName.trim()
  if (identities !== 1 || applications !== 1) fail('AppX manifest is missing its unique Identity/Application')
  return manifest
}

export async function inspectPackage(packagePath, appDir, identity, version, stageApp, expectedNative, expectedModel) {
  const require = createRequire(join(appDir, 'package.json'))
  const unzipper = require('unzipper'), asar = require('@electron/asar')
  const packageBefore = await hashFile(packagePath)
  const archive = await unzipper.Open.file(packagePath)
  assertSafeArchivePaths(archive.files.map(entry => ({ path: entry.path, type: zipEntryType(entry) })))
  const files = archive.files.filter(entry => entry.type === 'File')
  const byPath = new Map(files.map(entry => [entry.path.toLowerCase(), entry]))
  for (const name of ['appxmanifest.xml', 'appxblockmap.xml', '[content_types].xml', 'app/resources/app.asar']) {
    if (!byPath.has(name)) fail(`MSIX is missing ${name}`)
  }
  const expectedByZipPath = new Map([
    ...expectedNative.map(entry => [`app/resources/native/win32-x64/${entry.path}`.toLowerCase(), entry]),
    ...expectedModel.map(entry => [`app/resources/offline-model/${entry.path}`.toLowerCase(), entry]),
  ])
  const temporary = await mkdtemp(join(dirname(packagePath), '.candidate-inspection-'))
  const temporaryAsar = join(temporary, 'app.asar')
  try {
    const digests = new Map(), counter = { bytes: 0 }
    for (const entry of files) {
      const key = entry.path.toLowerCase()
      const cap = key === 'app/resources/app.asar' ? 512 * 1024 * 1024
        : key === 'appxblockmap.xml' ? 32 * 1024 * 1024
        : ['appxmanifest.xml', '[content_types].xml'].includes(key) ? 1024 * 1024
        : expectedByZipPath.get(key)?.bytes ?? MAX_NATIVE_ENTRY_BYTES
      // Drain every file once. Managed payload hashes are reused below, and an
      // extra entry cannot hide an oversized stream behind central-directory metadata.
      const observed = await consumeZipEntry(entry, cap, { counter, ...(key === 'app/resources/app.asar' ? { output: temporaryAsar } : {}) })
      digests.set(key, observed)
    }
    const manifest = parseManifest((await readZipEntry(byPath.get('appxmanifest.xml'), 1024 * 1024)).toString('utf8'), require)
    validateAppxIdentity(manifest, identity, version)
    if (!byPath.has(manifest.applicationExecutable.toLowerCase())) fail('AppX application executable is missing')
    const inventory = (prefix, expected) => {
      const actual = files.filter(entry => entry.path.toLowerCase().startsWith(prefix))
        .map(entry => ({ path: entry.path.slice(prefix.length), ...digests.get(entry.path.toLowerCase()) }))
      assertExactFileInventory(actual, expected, `MSIX ${prefix} payload`)
      return actual
    }
    const packageNative = inventory('app/resources/native/win32-x64/', expectedNative)
    const packageModel = inventory('app/resources/offline-model/', expectedModel)
    const asarHandle = await open(temporaryAsar, 'r')
    try {
      const prefix = Buffer.alloc(8)
      const { bytesRead } = await asarHandle.read(prefix, 0, 8, 0)
      const headerBytes = prefix.readUInt32LE(4)
      if (bytesRead !== 8 || prefix.readUInt32LE(0) !== 4 || headerBytes < 8 || headerBytes > 16 * 1024 * 1024 || headerBytes > digests.get('app/resources/app.asar').bytes - 8) fail('Invalid or oversized ASAR header')
    } finally { await asarHandle.close() }
    const expectedOut = await fingerprintDirectory(join(stageApp, 'out')), packagedOut = []
    for (const path of ['main/index.js', 'preload/index.js', 'renderer/index.html']) {
      if (!expectedOut.some(entry => entry.path === path)) fail(`Required compiled entry is missing: ${path}`)
    }
    for (const source of expectedOut) {
      const path = `out/${source.path}`
      const archived = asar.statFile(temporaryAsar, path, false)
      if ('link' in archived || 'files' in archived || archived.unpacked) fail(`app.asar build output is not an archived regular file: ${path}`)
      if (archived.size !== source.bytes) fail(`app.asar build output size mismatch: ${path}`)
      const packaged = asar.extractFile(temporaryAsar, path)
      packagedOut.push({ path: source.path, bytes: packaged.length, sha256: createHash('sha256').update(packaged).digest('hex') })
    }
    const allAsarOut = asar.listPackage(temporaryAsar, { isPack: false })
      .map(path => path.replace(/^\//, ''))
      .filter(path => path.startsWith('out/') && !('files' in asar.statFile(temporaryAsar, path, false)))
    if (allAsarOut.length !== expectedOut.length) fail('app.asar has missing or extra build outputs')
    assertExactFileInventory(packagedOut, expectedOut, 'app.asar build outputs')
    const metadata = asar.statFile(temporaryAsar, 'package.json', false)
    if ('link' in metadata || 'files' in metadata || metadata.unpacked || !Number.isSafeInteger(metadata.size) || metadata.size > 1024 * 1024) fail('Invalid ASAR package metadata')
    const packageJson = JSON.parse(asar.extractFile(temporaryAsar, 'package.json').toString('utf8'))
    if (packageJson.version !== version || packageJson.main !== './out/main/index.js') fail(`app.asar package metadata mismatch for ${version}`)
    const packageAfter = await hashFile(packagePath)
    if (packageAfter.bytes !== packageBefore.bytes || packageAfter.sha256 !== packageBefore.sha256) fail('MSIX changed during inspection')
    return { manifest, native: packageNative, model: packageModel, builtOut: expectedOut, package: packageBefore, asar: digests.get('app/resources/app.asar'), inspectedZipFiles: files.length, inspectedUncompressedBytes: counter.bytes }
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

async function main() {
  if (process.platform !== 'win32') fail('build-windows-store-candidate.mjs must run on a real Windows host')
  const { values } = parseArgs({ options: {
    'source-root': { type: 'string' }, 'source-commit': { type: 'string' }, 'identity-profile': { type: 'string' },
    version: { type: 'string' }, 'model-package': { type: 'string' }, 'native-zip': { type: 'string' }, out: { type: 'string' }, 'npm-cli': { type: 'string' },
  } })
  for (const key of ['source-root', 'source-commit', 'identity-profile', 'version', 'model-package', 'native-zip', 'out']) if (!values[key]) fail(`--${key} is required`)
  for (const key of ['source-root', 'identity-profile', 'model-package', 'native-zip', 'out', 'npm-cli']) if (values[key] && !isAbsolute(values[key])) fail(`--${key} requires an absolute path`)
  const identity = await readWindowsStoreIdentityProfile(values['identity-profile'])
  const input = assertCandidateInputs({ sourceCommit: values['source-commit'], identity, version: values.version, outputRoot: values.out })
  input.outputRoot = join(await realpath(dirname(input.outputRoot)), basename(input.outputRoot))
  const sourceRoot = await realpath(values['source-root'])
  if (sourceRoot !== await realpath(scriptRoot)) fail('--source-root must be the checkout that owns this candidate builder')
  if (await gitText(sourceRoot, ['rev-parse', 'HEAD']) !== input.sourceCommit) fail('Source checkout HEAD does not match --source-commit')
  if (await gitText(sourceRoot, ['status', '--porcelain', '--untracked-files=no'])) fail('Source checkout must be tracked-clean before candidate archive')
  if (await exists(input.outputRoot)) fail('Candidate output root already exists; refusing overwrite')
  const resolvedModel = await realpath(values['model-package'])
  const outputRelation = relative(resolvedModel, resolve(input.outputRoot))
  if (outputRelation === '' || (!isAbsolute(outputRelation) && !outputRelation.startsWith(`..${sep}`) && outputRelation !== '..')) fail('Candidate output root must be outside the model input directory')
  const [nativeName, nativeSha256] = artifacts['win32-x64']
  if ((await nativeDigest(values['native-zip'])) !== nativeSha256 || extname(values['native-zip']).toLowerCase() !== '.zip') fail('Native ZIP does not match the fixed win32-x64 artifact')
  let created = false
  try {
    await mkdir(input.outputRoot); created = true
    const stageRoot = join(input.outputRoot, 'stage')
    await mkdir(stageRoot)
    const snapshot = await snapshotSource(sourceRoot, input.sourceCommit, join(stageRoot, 'source'))
    const snapshotFiles = await fingerprintDirectory(snapshot)
    const stagedIdentityProfile = join(stageRoot, 'identity-profile.json')
    await writeFile(stagedIdentityProfile, JSON.stringify(input.identity, null, 2) + '\n', { flag: 'wx' })
    const snapshotApp = join(snapshot, 'app')
    const sourceApp = await fingerprintDirectory(snapshotApp)
    const appDir = join(stageRoot, 'app')
    await cp(snapshotApp, appDir, { recursive: true, force: false, errorOnExist: true, dereference: false })
    const stageSources = () => fingerprintDirectory(appDir, { skipRootDirectories: ['node_modules', 'out'] })
    const stagedSourceBeforeBuild = await stageSources()
    assertExactFileInventory(stagedSourceBeforeBuild, sourceApp, 'staged app source')
    const stagedLock = await hashFile(join(appDir, 'package-lock.json'))
    const npm = await npmCliPath(values['npm-cli'], appDir)
    const nodeVersion = (await run(process.execPath, ['--version'], { cwd: appDir, capture: true })).stdout.trim()
    const npmVersion = (await run(process.execPath, [npm, '--version'], { cwd: appDir, capture: true })).stdout.trim()
    await run(process.execPath, [npm, 'ci', '--include=dev'], { cwd: appDir })
    await run(process.execPath, [npm, 'run', 'build'], { cwd: appDir })
    const stagedSourceAfterBuild = await stageSources()
    assertExactFileInventory(stagedSourceAfterBuild, sourceApp, 'staged app source after build')
    const afterBuildLock = await hashFile(join(appDir, 'package-lock.json'))
    if (afterBuildLock.sha256 !== stagedLock.sha256 || afterBuildLock.bytes !== stagedLock.bytes) fail('Staged package-lock changed during candidate build')
    const modelDir = join(stageRoot, 'inputs', 'offline-model')
    const nativeDir = join(stageRoot, 'inputs', 'native', 'win32-x64')
    const model = await copyVerifiedModel(await realpath(values['model-package']), modelDir, snapshot)
    const frozenNativeZip = join(stageRoot, 'inputs', nativeName)
    await copyFile(await realpath(values['native-zip']), frozenNativeZip, constants.COPYFILE_EXCL)
    if (await nativeDigest(frozenNativeZip) !== nativeSha256) fail('Native ZIP changed before freezing')
    const native = await extractNativeZip(frozenNativeZip, nativeDir, appDir, snapshot)
    if (await nativeDigest(frozenNativeZip) !== nativeSha256) fail('Frozen native ZIP changed during extraction')
    const packageDir = join(input.outputRoot, 'package')
    await run(process.execPath, [join(snapshot, 'scripts', 'prepare-offline-windows-store-build.mjs'), '--app-dir', appDir, '--model-package', modelDir, '--native-dir', nativeDir, '--out', packageDir, '--identity-profile', stagedIdentityProfile, '--version', input.version], { cwd: snapshot })
    const configPath = join(packageDir, 'offline-store.json')
    const config = await hashFile(configPath)
    const builtOut = await fingerprintDirectory(join(appDir, 'out'))
    const builder = join(appDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
    if (!(await exists(builder))) fail('electron-builder CLI was not installed in the isolated stage')
    await run(process.execPath, [builder, '--config', configPath, '--win', '--x64', '--publish', 'never'], { cwd: appDir })
    assertExactFileInventory(await fingerprintDirectory(join(appDir, 'out')), builtOut, 'staged build output after packaging')
    const configAfterPackage = await hashFile(configPath)
    if (configAfterPackage.sha256 !== config.sha256 || configAfterPackage.bytes !== config.bytes) fail('Store config changed during packaging')
    const finalPackage = await findOne(packageDir, path => /\.(appx|msix)$/i.test(path))
    const inspected = await inspectPackage(finalPackage, appDir, input.identity, input.version, appDir, native, model)
    assertExactFileInventory(await stageSources(), sourceApp, 'staged source after packaging')
    assertExactFileInventory(await fingerprintDirectory(join(appDir, 'out')), builtOut, 'build output after inspection')
    assertExactFileInventory(await fingerprintDirectory(modelDir), model, 'frozen model after packaging')
    assertExactFileInventory(await fingerprintDirectory(nativeDir), native, 'frozen native after packaging')
    assertExactFileInventory(await fingerprintDirectory(snapshot), snapshotFiles, 'frozen source snapshot after packaging')
    if ((await hashFile(configPath)).sha256 !== config.sha256) fail('Config changed during package inspection')
    if (await gitText(sourceRoot, ['rev-parse', 'HEAD']) !== input.sourceCommit || await gitText(sourceRoot, ['status', '--porcelain', '--untracked-files=no'])) {
      fail('Source checkout changed while building candidate; refusing a receipt')
    }
    const receipt = buildCandidateReceipt({
      source: { commit: input.sourceCommit, tree: await gitText(sourceRoot, ['rev-parse', `${input.sourceCommit}^{tree}`]), snapshotPaths: SNAPSHOT_PATHS, snapshotFiles },
      app: { sourceVersion: JSON.parse(await readFile(join(snapshotApp, 'package.json'), 'utf8')).version, packageVersion: input.version, lockSha256: stagedLock.sha256, sourceFiles: sourceApp, builtOut, asar: inspected.asar, tools: { nodeVersion, npmVersion, electronBuilderVersion: JSON.parse(await readFile(join(appDir, 'node_modules/electron-builder/package.json'), 'utf8')).version } },
      configSha256: config.sha256, config: JSON.parse(await readFile(configPath, 'utf8')), package: { name: basename(finalPackage), ...inspected.package, inspectedZipFiles: inspected.inspectedZipFiles, inspectedUncompressedBytes: inspected.inspectedUncompressedBytes }, native, model, manifest: inspected.manifest, nativeVersionCommandPassed: true,
    })
    await commitCandidateReceipt(input.outputRoot, receipt)
    console.log(JSON.stringify({ receipt: join(input.outputRoot, 'candidate-receipt.json'), package: finalPackage, platformEvidence: receipt.platformEvidence }, null, 2))
  } catch (error) {
    if (created) await writeFile(join(input.outputRoot, 'candidate-failure.json'), JSON.stringify({ success: false, error: error.message }, null, 2) + '\n', { flag: 'wx' }).catch(() => {})
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
