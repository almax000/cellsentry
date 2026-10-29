import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
// @ts-expect-error Node release tooling is outside application compilation.
import { copyVerifiedModel, inspectPackage } from '../../scripts/build-windows-store-candidate.mjs'
// @ts-expect-error Existing fixed-model package tooling.
import { stageRelease } from '../../scripts/lib/stage-model-package.mjs'

const require = createRequire(import.meta.url)
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const tempRoot = join(appRoot, 'tmp', 'candidate-archive-fixtures')
const identity = { identityName: '12345CellSentry.CellSentry', publisher: 'CN=01234567-89ab-cdef-0123-456789abcdef', publisherDisplayName: 'CellSentry' }
const foundation = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10'
const restricted = `${foundation}/restrictedcapabilities`
const bytes = (value: string) => Buffer.from(value)
const digest = (value: Buffer) => ({ bytes: value.length, sha256: createHash('sha256').update(value).digest('hex') })
const outFiles = { 'main/index.js': 'main fixture', 'preload/index.js': 'preload fixture', 'renderer/index.html': '<main>fixture</main>', 'renderer/assets/app.js': 'fixture javascript', 'renderer/assets/app.css': 'body { color: black }' }
const nativeFiles = { 'llama.exe': bytes('MZfixture-only'), 'runtime.json': bytes('{"target":"win32-x64"}'), 'runtime.dll': bytes('DLL fixture') }
const modelFiles = { 'model.gguf': bytes('GGUF fixture only'), LICENSE: bytes('fixture license'), 'NOTICE.txt': bytes('fixture notice'), 'manifest.json': bytes('{"fixture":true}'), SHA256SUMS: bytes('fixture checksums') }

async function fixture(change: string = '') {
  mkdirSync(tempRoot, { recursive: true })
  const root = mkdtempSync(join(tempRoot, 'case-')), stage = join(root, 'stage'), source = join(root, 'asar-source')
  for (const [name, text] of Object.entries(outFiles)) {
    if (change === 'missing-main' && name === 'main/index.js') continue
    for (const parent of [stage, source]) {
      const path = join(parent, 'out', name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, change === 'asset' && parent === source && name.endsWith('.css') ? 'changed CSS' : text)
    }
  }
  writeFileSync(join(source, 'package.json'), JSON.stringify({ version: change === 'asar-version' ? '1.24.8' : '1.24.7', main: './out/main/index.js' }))
  const asar = join(root, 'app.asar'); await require('@electron/asar').createPackage(source, asar)
  const zip = new (require('jszip'))()
  const appId = change === 'application-id' ? 'OtherApp' : 'CellSentry'
  const cap = change === 'capability' ? '' : '<rescap:Capability Name="runFullTrust"/>'
  zip.file('AppxManifest.xml', `<Package xmlns="${change === 'namespace' ? 'urn:invalid' : foundation}" xmlns:rescap="${restricted}"><Identity Name="${identity.identityName}" Publisher="${identity.publisher}" Version="1.24.7.0" ProcessorArchitecture="x64"/><Properties><PublisherDisplayName>CellSentry</PublisherDisplayName></Properties><Applications><Application Id="${appId}" Executable="app\\CellSentry Beta.exe" EntryPoint="Windows.FullTrustApplication"/></Applications><Capabilities>${cap}</Capabilities></Package>`)
  if (change !== 'metadata') zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  zip.file('AppxBlockMap.xml', '<BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap"/>')
  zip.file('app/CellSentry Beta.exe', 'MZfixture')
  zip.file('app/resources/app.asar', readFileSync(asar))
  for (const [name, value] of Object.entries(nativeFiles)) zip.file(`app/resources/native/win32-x64/${name}`, change === 'native' && name.endsWith('.dll') ? bytes('different DLL') : value)
  for (const [name, value] of Object.entries(modelFiles)) if (!(change === 'license' && name === 'LICENSE')) zip.file(`app/resources/offline-model/${name}`, value)
  if (change === 'extra-model') zip.file('app/resources/offline-model/extra.gguf', 'extra fixture')
  if (change === 'drive') zip.file('C:/outside.txt', 'bad path')
  if (change === 'extra-stream') zip.file('extra/underdeclared.bin', 'unreported bytes')
  const encoded: Buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
  if (change === 'extra-stream') {
    for (let cursor = 0; cursor + 46 < encoded.length; cursor++) if (encoded.readUInt32LE(cursor) === 0x02014b50) {
      const length = encoded.readUInt16LE(cursor + 28)
      if (encoded.subarray(cursor + 46, cursor + 46 + length).toString() === 'extra/underdeclared.bin') encoded.writeUInt32LE(1, cursor + 24)
    }
  }
  const packagePath = join(root, 'candidate.msix'); writeFileSync(packagePath, encoded)
  return () => inspectPackage(packagePath, appRoot, identity, '1.24.7', stage, Object.entries(nativeFiles).map(([path, value]) => ({ path, ...digest(value) })), Object.entries(modelFiles).map(([path, value]) => ({ path, ...digest(value) })))
}

describe('actual candidate archive contract (synthetic payload, no Windows claim)', () => {
  it('reads all staged assets and all five model files from a real ZIP and ASAR', async () => {
    const inspect = await fixture(); await expect(inspect()).resolves.toMatchObject({ manifest: { version: '1.24.7.0' } })
  })
  it.each(['metadata', 'namespace', 'capability', 'application-id', 'missing-main', 'asset', 'asar-version', 'native', 'license', 'extra-model', 'drive', 'extra-stream'])('rejects the independent %s counterexample', async change => {
    const inspect = await fixture(change); await expect(inspect()).rejects.toThrow()
  })
  it('creates required model staging parents without modifying the verified source package', async () => {
    mkdirSync(tempRoot, { recursive: true })
    const root = mkdtempSync(join(tempRoot, 'model-')), source = join(root, 'source'), snapshot = join(root, 'snapshot')
    mkdirSync(join(snapshot, 'model-artifacts'), { recursive: true })
    const modelName = 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf'
    const data = bytes('GGUF tiny synthetic'), license = bytes('license'), notice = bytes('notice')
    const spec = { release: 'formula-cancellation-v2-20261016', base: 'fixture/base', revision: 'fixture', model: { name: modelName, ...digest(data) }, license: { name: 'LICENSE', ...digest(license) }, notice: { name: 'NOTICE.txt', ...digest(notice) } }
    writeFileSync(join(root, 'model.gguf'), data); writeFileSync(join(root, 'LICENSE'), license); writeFileSync(join(root, 'NOTICE.txt'), notice)
    writeFileSync(join(snapshot, 'model-artifacts/formula-cancellation-v2-manifest.json'), JSON.stringify({ tag: spec.release, assets: [{ file: modelName, ...digest(data) }], package: { base: spec.base, revision: spec.revision, files: [spec.license, spec.notice] } }))
    await stageRelease({ modelPath: join(root, 'model.gguf'), outDir: source, spec, licensePath: join(root, 'LICENSE'), noticePath: join(root, 'NOTICE.txt') })
    await expect(copyVerifiedModel(source, join(root, 'not-created', 'inputs', 'offline-model'), snapshot)).resolves.toHaveLength(5)
    expect(readFileSync(join(source, modelName))).toEqual(data)
  })
})
