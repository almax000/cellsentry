import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, lstat, open, readdir, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, win32 } from 'node:path'
import { release } from 'node:os'
import { randomUUID } from 'node:crypto'
import { validateWindowsStoreIdentity, validateWindowsStoreVersion } from './offline-windows-store-config.mjs'

const SIGNING_ENV = [
  'CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD',
  'WIN_CSC_NAME', 'AZURE_KEY_VAULT_CERTIFICATE', 'AZURE_KEY_VAULT_CLIENT_ID',
  'AZURE_KEY_VAULT_CLIENT_SECRET', 'AZURE_KEY_VAULT_TENANT_ID',
]

export function assertNoSigningCredentials(environment = process.env) {
  const present = SIGNING_ENV.filter(name => Object.hasOwn(environment, name) && environment[name] !== '')
  if (present.length) throw new Error(`Refusing Store candidate build while signing credential environment is present: ${present.join(', ')}`)
}

export function assertCandidateInputs({ sourceCommit, identity, version, outputRoot, signingEnv = process.env }) {
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('sourceCommit must be a full 40-character Git SHA')
  if (typeof outputRoot !== 'string' || !isAbsolute(outputRoot)) throw new Error('outputRoot must be an absolute path')
  assertNoSigningCredentials(signingEnv)
  return { sourceCommit: sourceCommit.toLowerCase(), identity: validateWindowsStoreIdentity(identity), version: validateWindowsStoreVersion(version), outputRoot }
}

export function assertSafeArchivePaths(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10_000) throw new Error('Archive inventory is empty or exceeds the entry limit')
  const names = new Set()
  for (const entry of entries) {
    const name = entry?.path
    const parts = typeof name === 'string' ? name.replace(/\/$/, '').split('/') : []
    if (typeof name !== 'string' || !name || name.includes('\0') || name.includes('\\') || name.includes(':') || isAbsolute(name) || win32.isAbsolute(name) || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
      throw new Error('Archive path is not safe: traversal or absolute path')
    }
    if (entry.type === 'symlink' || entry.type === 'link') throw new Error(`Archive links are forbidden: ${name}`)
    if (entry.type && entry.type !== 'file' && entry.type !== 'directory') throw new Error(`Archive entry type is not allowed: ${name}`)
    const folded = name.toLocaleLowerCase('en-US')
    if (names.has(folded)) throw new Error(`Archive contains duplicate case-insensitive path: ${name}`)
    names.add(folded)
  }
  return entries
}

export async function hashFile(path) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length }
  return { bytes, sha256: hash.digest('hex') }
}

export async function fingerprintDirectory(root, { skipRootDirectories = [] } = {}) {
  const physicalRoot = resolve(root)
  const entries = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (directory === physicalRoot && entry.isDirectory() && skipRootDirectories.includes(entry.name)) continue
      const path = resolve(directory, entry.name)
      const rel = relative(physicalRoot, path).replaceAll('\\', '/')
      if (!rel || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Directory traversal while fingerprinting candidate input')
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw new Error(`Candidate input must not contain symlinks: ${rel}`)
      if (stat.isDirectory()) await walk(path)
      else if (stat.isFile()) entries.push({ path: rel, ...(await hashFile(path)) })
      else throw new Error(`Candidate input must contain only regular files/directories: ${rel}`)
    }
  }
  await walk(physicalRoot)
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

export function assertExactFileInventory(actual, expected, label) {
  const actualByPath = new Map(actual.map(entry => [entry.path, entry]))
  const expectedByPath = new Map(expected.map(entry => [entry.path, entry]))
  if (actualByPath.size !== actual.length || expectedByPath.size !== expected.length) throw new Error(`${label} inventory contains duplicate paths`)
  if (actualByPath.size !== expectedByPath.size) throw new Error(`${label} inventory has missing or extra files`)
  for (const [path, entry] of expectedByPath) {
    const found = actualByPath.get(path)
    if (!found || found.bytes !== entry.bytes || found.sha256 !== entry.sha256) throw new Error(`${label} file mismatch: ${path}`)
  }
}

export function validateAppxIdentity(manifest, identity, version) {
  const expectedVersion = `${validateWindowsStoreVersion(version)}.0`
  const publicIdentity = validateWindowsStoreIdentity(identity)
  if (!manifest || manifest.name !== publicIdentity.identityName || manifest.publisher !== publicIdentity.publisher || manifest.publisherDisplayName !== publicIdentity.publisherDisplayName) throw new Error('AppX manifest identity does not match the supplied Store identity')
  if (manifest.version !== expectedVersion) throw new Error(`AppX manifest version must be ${expectedVersion}`)
  if (manifest.processorArchitecture !== 'x64') throw new Error('AppX manifest must target x64')
  if (manifest.fullTrust !== true || manifest.fullTrustCapability !== true) throw new Error('AppX manifest must declare FullTrust entry and capability')
  if (manifest.applicationId !== 'CellSentry' || typeof manifest.applicationExecutable !== 'string' || !manifest.applicationExecutable.startsWith('app/')) throw new Error('AppX manifest must identify the CellSentry application executable')
  return manifest
}

export function buildCandidateReceipt({ source, app, configSha256, config, package: finalPackage, native, model, manifest, nativeVersionCommandPassed = false }) {
  if (!Array.isArray(app?.builtOut) || !app.builtOut.length || !config || !manifest) throw new Error('Candidate receipt requires observed builtOut, config and manifest')
  if (nativeVersionCommandPassed && process.platform !== 'win32') throw new Error('Native Windows execution cannot be claimed from another host')
  return {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, osRelease: release(), node: process.version },
    releaseReady: false,
    source,
    app,
    configSha256,
    config,
    native,
    model,
    package: finalPackage,
    manifest,
    checks: { payloadMatchesFrozenInputs: true, nativeVersionCommandPassed },
    platformEvidence: {
      storeSigningVerified: false,
      storeCertificationVerified: false,
      storeAcquisitionVerified: false,
      windows11Verified: false,
      updaterVerified: false,
      iapVerified: false,
    },
  }
}

/** Commit only a complete receipt; an existing file is never replaced. */
export async function commitCandidateReceipt(outputRoot, receipt) {
  const temporary = join(outputRoot, `.candidate-receipt-${randomUUID()}.tmp`)
  const destination = join(outputRoot, 'candidate-receipt.json')
  const handle = await open(temporary, 'wx')
  try {
    await handle.writeFile(JSON.stringify(receipt, null, 2) + '\n')
    await handle.sync()
  } catch (error) {
    await handle.close(); await rm(temporary, { force: true }); throw error
  }
  await handle.close()
  try { await link(temporary, destination) } finally { await rm(temporary, { force: true }).catch(() => {}) }
  return destination
}
