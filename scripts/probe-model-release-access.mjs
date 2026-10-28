#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalSpec, expectedPackageFiles } from './lib/stage-model-package.mjs'

export const MODEL_REPOSITORY = 'almax000/cellsentry'
export const MODEL_RELEASE_ID = 421521746

class ProbeFailure extends Error {
  constructor(kind, status = null) {
    super(kind)
    this.kind = kind
    this.status = status
  }
}

function initialReport() {
  return {
    schemaVersion: 1,
    repository: MODEL_REPOSITORY,
    releaseId: MODEL_RELEASE_ID,
    releaseMetadataVerified: false,
    exactAssetMetadataVerified: false,
    licenseDownloaded: false,
    licenseVerified: false,
    fullModelDownloaded: false,
    inferenceVerified: false,
    publicDistributionVerified: false,
    metadataStatus: null,
    licenseStatus: null,
    errorKind: null,
  }
}

function requireWorkflowEnvironment(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== MODEL_REPOSITORY || !env.GH_TOKEN) {
    throw new ProbeFailure('environment-not-eligible')
  }
}

function defaultApi(args) {
  return new Promise((resolveRequest, rejectRequest) => {
    execFile('gh', ['api', ...args], {
      encoding: 'buffer',
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const status = /HTTP (\d{3})/.exec(String(stderr))?.[1]
        rejectRequest(new ProbeFailure(error.killed ? 'gh-timeout' : 'gh-api-failed', status ? Number(status) : null))
        return
      }
      resolveRequest(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout))
    })
  })
}

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new ProbeFailure('invalid-release-metadata')
  }
}

function expectedTag(spec) {
  return `model-${spec.release}`
}

function assertReleaseMetadata(release, spec) {
  if (!release || release.id !== MODEL_RELEASE_ID || release.tag_name !== expectedTag(spec) || typeof release.draft !== 'boolean') {
    throw new ProbeFailure('release-metadata-mismatch')
  }
  const expected = expectedPackageFiles(spec)
  const actual = Array.isArray(release.assets) ? release.assets : []
  if (actual.length !== expected.length) throw new ProbeFailure('asset-metadata-mismatch')
  for (const entry of expected) {
    const asset = actual.find((candidate) => candidate?.name === entry.name)
    if (!asset || !Number.isSafeInteger(asset.id) || asset.id <= 0 || asset.size !== entry.bytes || asset.digest !== `sha256:${entry.sha256}`) {
      throw new ProbeFailure('asset-metadata-mismatch')
    }
  }
  return actual.find((asset) => asset.name === spec.license.name)
}

function errorDetails(error) {
  return error instanceof ProbeFailure
    ? { errorKind: error.kind, status: error.status }
    : { errorKind: 'unexpected-error', status: null }
}

/**
 * Read only the release JSON and the small LICENSE asset. The GGUF remains
 * untouched, and this never establishes anonymous/public distribution.
 */
export async function probeModelReleaseAccess({ env = process.env, api = defaultApi, spec, receiptPath } = {}) {
  const report = initialReport()
  try {
    requireWorkflowEnvironment(env)
    const resolvedSpec = spec ?? await canonicalSpec(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
    const metadataBytes = await api([
      '-H', 'Accept: application/vnd.github+json',
      `repos/${MODEL_REPOSITORY}/releases/${MODEL_RELEASE_ID}`,
    ])
    report.metadataStatus = 200
    const metadata = parseJson(metadataBytes)
    const licenseAsset = assertReleaseMetadata(metadata, resolvedSpec)
    report.releaseMetadataVerified = true
    report.exactAssetMetadataVerified = true
    report.draft = metadata.draft
    report.tag = metadata.tag_name

    const license = await api([
      '-H', 'Accept: application/octet-stream',
      `repos/${MODEL_REPOSITORY}/releases/assets/${licenseAsset.id}`,
    ])
    report.licenseStatus = 200
    report.licenseDownloaded = true
    report.licenseBytes = license.length
    report.licenseSha256 = createHash('sha256').update(license).digest('hex')
    if (license.length !== resolvedSpec.license.bytes || report.licenseSha256 !== resolvedSpec.license.sha256) {
      throw new ProbeFailure('license-verification-failed')
    }
    report.licenseVerified = true
  } catch (error) {
    const details = errorDetails(error)
    report.errorKind = details.errorKind
    if (report.licenseStatus === null && report.metadataStatus !== null) report.licenseStatus = details.status
    if (report.metadataStatus === null) report.metadataStatus = details.status
  }
  if (receiptPath) {
    const output = resolve(receiptPath)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  }
  return report
}

async function main() {
  const index = process.argv.indexOf('--receipt')
  const receiptPath = index === -1 ? undefined : process.argv[index + 1]
  if (index !== -1 && !receiptPath) throw new Error('--receipt requires a path')
  const report = await probeModelReleaseAccess({ receiptPath })
  console.log(JSON.stringify(report))
  if (report.errorKind) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
