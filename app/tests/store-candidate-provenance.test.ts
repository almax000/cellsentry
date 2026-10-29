import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error Release tooling runs in Node, outside the renderer compilation.
import {
  assertCandidateInputs,
  assertExactFileInventory,
  assertSafeArchivePaths,
  buildCandidateReceipt,
  commitCandidateReceipt,
  fingerprintDirectory,
  validateAppxIdentity,
} from '../../scripts/lib/windows-store-provenance.mjs'


const identity = {
  identityName: '12345CellSentry.CellSentry',
  publisher: 'CN=01234567-89ab-cdef-0123-456789abcdef',
  publisherDisplayName: 'CellSentry',
}

function temporary() {
  const parent = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'candidate-provenance-core')
  mkdirSync(parent, { recursive: true })
  return mkdtempSync(join(parent, 'case-'))
}

describe('Windows Store candidate provenance core', () => {
  it('binds an auditable candidate to an exact source, identity, and three-part version', () => {
    const inputs = assertCandidateInputs({
      sourceCommit: 'a'.repeat(40), identity, version: '1.24.7',
      outputRoot: '/candidate', signingEnv: {},
    })
    expect(inputs.sourceCommit).toBe('a'.repeat(40))
    expect(inputs.version).toBe('1.24.7')
  })

  it.each([
    [{ sourceCommit: 'short', identity, version: '1.24.7', outputRoot: '/candidate', signingEnv: {} }],
    [{ sourceCommit: 'a'.repeat(40), identity, version: '01.24.7', outputRoot: '/candidate', signingEnv: {} }],
    [{ sourceCommit: 'a'.repeat(40), identity, version: '1.24.7', outputRoot: 'relative', signingEnv: {} }],
    [{ sourceCommit: 'a'.repeat(40), identity, version: '1.24.7', outputRoot: '/candidate', signingEnv: { CSC_LINK: 'present' } }],
  ])('rejects an unpinned source, unsafe output, invalid version, or signing credential', input => {
    expect(() => assertCandidateInputs(input)).toThrow(/commit|version|absolute|signing/i)
  })

  it('rejects traversal, duplicate case-folded paths, and links in archive inventory', () => {
    expect(() => assertSafeArchivePaths([
      { path: 'app/resources/app.asar', type: 'file' },
      { path: '../outside', type: 'file' },
    ])).toThrow(/traversal|safe/i)
    expect(() => assertSafeArchivePaths([
      { path: 'app/Model.gguf', type: 'file' },
      { path: 'app/model.gguf', type: 'file' },
    ])).toThrow(/case/i)
    expect(() => assertSafeArchivePaths([{ path: 'app/link', type: 'symlink' }])).toThrow(/link/i)
  })

  it('checks AppX identity, explicit fourth version component, x64, and FullTrust', () => {
    expect(() => validateAppxIdentity({
      fullTrustCapability: true, applicationId: 'CellSentry', applicationExecutable: 'app/CellSentry Beta.exe',
      name: identity.identityName,
      publisher: identity.publisher,
      publisherDisplayName: identity.publisherDisplayName,
      version: '1.24.7.0', processorArchitecture: 'x64', fullTrust: true,
    }, identity, '1.24.7')).not.toThrow()
    expect(() => validateAppxIdentity({
      fullTrustCapability: true, applicationId: 'CellSentry', applicationExecutable: 'app/CellSentry Beta.exe',
      name: identity.identityName,
      publisher: identity.publisher,
      publisherDisplayName: identity.publisherDisplayName,
      version: '1.24.7.1', processorArchitecture: 'x64', fullTrust: true,
    }, identity, '1.24.7')).toThrow(/version/i)
  })

  it('rejects byte drift, missing license, and extra payload files instead of trusting a receipt label', () => {
    const expected = [
      { path: 'LICENSE', bytes: 2, sha256: 'a'.repeat(64) },
      { path: 'NOTICE.txt', bytes: 3, sha256: 'b'.repeat(64) },
    ]
    expect(() => assertExactFileInventory([
      { path: 'LICENSE', bytes: 2, sha256: 'a'.repeat(64) },
      { path: 'NOTICE.txt', bytes: 4, sha256: 'b'.repeat(64) },
    ], expected, 'model')).toThrow(/mismatch/i)
    expect(() => assertExactFileInventory([
      { path: 'LICENSE', bytes: 2, sha256: 'a'.repeat(64) },
    ], expected, 'model')).toThrow(/missing|extra/i)
    expect(() => assertExactFileInventory([...expected, { path: 'extra.bin', bytes: 1, sha256: 'c'.repeat(64) }], expected, 'model')).toThrow(/missing|extra/i)
  })

  it('makes a receipt bind source, staged lock, inputs, config, and final package hashes', () => {
    const receipt = buildCandidateReceipt({
      source: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
      app: { packageVersion: '1.24.7', lockSha256: 'c'.repeat(64), builtOut: [{ path: 'main/index.js', bytes: 2, sha256: 'c'.repeat(64) }] },
      config: { publish: null }, manifest: { version: '1.24.7.0' },
      configSha256: 'd'.repeat(64), package: { sha256: 'e'.repeat(64), bytes: 42 },
      native: [{ path: 'llama.exe', sha256: 'f'.repeat(64), bytes: 3 }],
      model: [{ path: 'LICENSE', sha256: '0'.repeat(64), bytes: 2 }],
    })
    expect(receipt.platformEvidence.windows11Verified).toBe(false)
    expect(receipt.platformEvidence.storeAcquisitionVerified).toBe(false)
    expect(receipt.package.sha256).toBe('e'.repeat(64))
    expect(receipt.app.builtOut).toHaveLength(1)
    expect(receipt.host.platform).toBe(process.platform)
    expect(receipt.releaseReady).toBe(false)
  })

  it('rejects a receipt without its observed compiled inventory', () => {
    expect(() => buildCandidateReceipt({ app: {}, config: {}, manifest: {} })).toThrow(/builtOut/)
  })

  it('preserves an existing receipt and leaves no partial JSON on serialization failure', async () => {
    const root = temporary(), path = join(root, 'candidate-receipt.json')
    const payload = { fixture: true, complete: ['source', 'compiled', 'package'] }
    await commitCandidateReceipt(root, payload)
    await expect(commitCandidateReceipt(root, { replaced: true })).rejects.toThrow()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(payload)
    expect(readdirSync(root)).toEqual(['candidate-receipt.json'])
    const failed = temporary(), cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    await expect(commitCandidateReceipt(failed, cyclic)).rejects.toThrow()
    expect(existsSync(join(failed, 'candidate-receipt.json'))).toBe(false)
    expect(readdirSync(failed)).toEqual([])
  })

  it('detects lockfile and new source drift while excluding only generated root directories', async () => {
    const root = temporary()
    mkdirSync(join(root, 'node_modules')); mkdirSync(join(root, 'out'))
    writeFileSync(join(root, 'package-lock.json'), 'fixed lock')
    writeFileSync(join(root, 'source.js'), 'fixed source')
    const original = await fingerprintDirectory(root, { skipRootDirectories: ['node_modules', 'out'] })
    writeFileSync(join(root, 'out', 'generated.js'), 'compiled')
    expect(await fingerprintDirectory(root, { skipRootDirectories: ['node_modules', 'out'] })).toEqual(original)
    writeFileSync(join(root, 'package-lock.json'), 'changed lock')
    const changed = await fingerprintDirectory(root, { skipRootDirectories: ['node_modules', 'out'] })
    expect(() => assertExactFileInventory(changed, original, 'source')).toThrow(/mismatch/)
    writeFileSync(join(root, 'new-source.js'), 'unrecorded')
    const added = await fingerprintDirectory(root, { skipRootDirectories: ['node_modules', 'out'] })
    expect(() => assertExactFileInventory(added, original, 'source')).toThrow(/extra/)
  })

})
