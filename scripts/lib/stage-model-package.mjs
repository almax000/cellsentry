import { constants, createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

export async function hashFile(file) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
    bytes += chunk.length
  }
  return { bytes, sha256: hash.digest('hex') }
}

async function verify(file, expected) {
  const actual = await hashFile(file)
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(`${file} does not match the fixed release manifest`)
  }
  return actual
}

// GitHub documents a strict, per-asset limit of less than 2 GiB.
// https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
export function assertGitHubAssetSize(name, bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes >= 2 ** 31) {
    throw new Error(`${name} must be smaller than 2 GiB for GitHub Releases`)
  }
}

function packageMetadata(spec) {
  const manifest = {
    schema_version: 1,
    release: spec.release,
    task: 'formula_review',
    base: spec.base,
    revision: spec.revision,
    files: [spec.model, spec.license, spec.notice].map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex')
  const sums = [...manifest.files, { name: 'manifest.json', sha256: manifestSha256 }]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${entry.sha256}  ${entry.name}`)
    .join('\n') + '\n'
  return { manifest, manifestBytes, manifestSha256, sums }
}

/** Offline verification against the repository's pinned spec, never a supplied checksum file. */
export async function verifyReleaseDirectory({ outDir, spec }) {
  const metadata = packageMetadata(spec)
  const generated = [
    { name: 'manifest.json', data: metadata.manifestBytes },
    { name: 'SHA256SUMS', data: Buffer.from(metadata.sums) },
  ].map(({ name, data }) => ({ name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }))
  const expected = [...metadata.manifest.files, ...generated]
  const names = (await readdir(outDir)).sort()
  if (JSON.stringify(names) !== JSON.stringify(expected.map(({ name }) => name).sort())) {
    throw new Error('Release directory must contain exactly the five public package files')
  }
  for (const entry of expected) {
    const path = join(outDir, entry.name)
    const info = await lstat(path)
    if (!info.isFile()) throw new Error(`${entry.name} must be a regular file, not a symlink or directory`)
    assertGitHubAssetSize(entry.name, info.size)
    await verify(path, entry)
  }
  return {
    repository: 'almax000/cellsentry',
    tag: `model-${spec.release}`,
    model_version: spec.release,
    local_verification: 'passed',
    assets: expected,
  }
}

/**
 * The CLI below supplies the canonical specification. Tests may supply a tiny
 * injected spec to exercise streaming and no-overwrite behaviour without a
 * 1.56 GiB model fixture.
 */
export async function stageRelease({ modelPath, outDir, spec, licensePath, noticePath }) {
  if (!modelPath || !outDir || !spec?.model || !spec?.license || !spec?.notice) throw new Error('Incomplete release staging request')
  for (const entry of [spec.model, spec.license, spec.notice]) assertGitHubAssetSize(entry.name, entry.bytes)
  if (!(await stat(modelPath)).isFile()) throw new Error('--model must name a regular file')
  await stat(dirname(outDir))
  // Validate every input before creating the stage directory. A typo or a
  // changed license therefore cannot leave a partial directory that looks
  // ready to upload.
  await verify(modelPath, spec.model)
  await verify(licensePath, spec.license)
  await verify(noticePath, spec.notice)
  await mkdir(outDir) // no recursive flag: an existing target is never overwritten

  const modelTarget = join(outDir, spec.model.name)
  await copyFile(modelPath, modelTarget, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL)
  await verify(modelTarget, spec.model)

  for (const [source, entry] of [[licensePath, spec.license], [noticePath, spec.notice]]) {
    const target = join(outDir, entry.name)
    await copyFile(source, target, constants.COPYFILE_EXCL)
    await verify(target, entry)
  }

  const { manifest, manifestBytes, manifestSha256, sums } = packageMetadata(spec)
  await Promise.all([
    writeFile(join(outDir, 'manifest.json'), manifestBytes, { flag: 'wx' }),
    writeFile(join(outDir, 'SHA256SUMS'), sums, { flag: 'wx' }),
  ])
  return { outDir, manifest, manifestSha256 }
}

export async function canonicalSpec(root) {
  const raw = JSON.parse(await readFile(join(root, 'model-artifacts/formula-cancellation-v2-manifest.json'), 'utf8'))
  const model = raw.assets.find((item) => item.file === 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf')
  const license = raw.package.files.find((item) => item.name === 'LICENSE')
  const notice = raw.package.files.find((item) => item.name === 'NOTICE.txt')
  if (!model || !license || !notice || raw.tag !== 'formula-cancellation-v2-20261016') throw new Error('Canonical formula-cancellation-v2 manifest is incomplete')
  return {
    release: raw.tag,
    base: raw.package.base,
    revision: raw.package.revision,
    model: { name: model.file, bytes: model.bytes, sha256: model.sha256 },
    license: { name: license.name, bytes: license.bytes, sha256: license.sha256 },
    notice: { name: notice.name, bytes: notice.bytes, sha256: notice.sha256 },
  }
}
