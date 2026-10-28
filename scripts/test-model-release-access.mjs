import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { expectedPackageFiles } from './lib/stage-model-package.mjs'
import { MODEL_RELEASE_ID, MODEL_REPOSITORY, probeModelReleaseAccess } from './probe-model-release-access.mjs'

const license = Buffer.from('synthetic license for probe')
const spec = {
  release: 'formula-cancellation-v2-20261016', base: 'base', revision: 'revision',
  model: { name: 'model.gguf', bytes: 7, sha256: 'a'.repeat(64) },
  license: { name: 'LICENSE', bytes: license.length, sha256: createHash('sha256').update(license).digest('hex') },
  notice: { name: 'NOTICE.txt', bytes: 3, sha256: 'b'.repeat(64) },
}
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: MODEL_REPOSITORY, GH_TOKEN: 'test-only' }

function release() {
  return {
    id: MODEL_RELEASE_ID,
    tag_name: `model-${spec.release}`,
    draft: true,
    assets: expectedPackageFiles(spec).map((entry, index) => ({ id: index + 1, name: entry.name, size: entry.bytes, digest: `sha256:${entry.sha256}` })),
  }
}

test('records draft metadata and verifies only the small LICENSE asset', async () => {
  const calls = []
  const report = await probeModelReleaseAccess({ env, spec, api: async (args) => {
    calls.push(args)
    return calls.length === 1 ? Buffer.from(JSON.stringify(release())) : license
  } })
  assert.equal(report.errorKind, null)
  assert.equal(report.draft, true)
  assert.equal(report.releaseMetadataVerified, true)
  assert.equal(report.exactAssetMetadataVerified, true)
  assert.equal(report.licenseVerified, true)
  assert.equal(report.fullModelDownloaded, false)
  assert.equal(report.inferenceVerified, false)
  assert.equal(report.publicDistributionVerified, false)
  assert.equal(calls.length, 2)
  assert.match(calls[1].at(-1), /releases\/assets\/2$/)
})

test('does not invoke the CLI adapter outside the narrowly scoped workflow environment', async () => {
  let called = false
  const report = await probeModelReleaseAccess({ env: {}, spec, api: async () => { called = true } })
  assert.equal(called, false)
  assert.equal(report.errorKind, 'environment-not-eligible')
  assert.equal(report.licenseDownloaded, false)
})

test('keeps incomplete draft metadata red without downloading an asset', async () => {
  let calls = 0
  const incomplete = release()
  incomplete.assets.pop()
  const report = await probeModelReleaseAccess({ env, spec, api: async () => {
    calls += 1
    return Buffer.from(JSON.stringify(incomplete))
  } })
  assert.equal(report.errorKind, 'asset-metadata-mismatch')
  assert.equal(calls, 1)
  assert.equal(report.licenseDownloaded, false)
})

test('rejects a different model digest while preserving the successful metadata HTTP status', async () => {
  const metadata = release()
  metadata.assets[0].digest = `sha256:${'c'.repeat(64)}`
  let calls = 0
  const report = await probeModelReleaseAccess({ env, spec, api: async () => {
    calls += 1
    return Buffer.from(JSON.stringify(metadata))
  } })
  assert.equal(report.errorKind, 'asset-metadata-mismatch')
  assert.equal(report.metadataStatus, 200)
  assert.equal(report.licenseDownloaded, false)
  assert.equal(calls, 1)
})

test('rejects a malformed asset identifier before constructing its API route', async () => {
  const metadata = release()
  metadata.assets.find(asset => asset.name === 'LICENSE').id = '../other-resource'
  let calls = 0
  const report = await probeModelReleaseAccess({ env, spec, api: async () => {
    calls += 1
    return calls === 1 ? Buffer.from(JSON.stringify(metadata)) : license
  } })
  assert.equal(report.errorKind, 'asset-metadata-mismatch')
  assert.equal(report.licenseDownloaded, false)
  assert.equal(calls, 1)
})

test('does not accept a same-length LICENSE with different bytes', async () => {
  let calls = 0
  const report = await probeModelReleaseAccess({ env, spec, api: async () => {
    calls += 1
    return calls === 1 ? Buffer.from(JSON.stringify(release())) : Buffer.alloc(license.length, 0)
  } })
  assert.equal(report.licenseDownloaded, true)
  assert.equal(report.licenseVerified, false)
  assert.equal(report.errorKind, 'license-verification-failed')
  assert.equal(report.fullModelDownloaded, false)
})
