import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { statfs } from 'fs/promises'
import { createReadStream } from 'fs'
import { join, resolve } from 'node:path'
import { installBundledModel, modelSetupError, setBundledModelError, type BundledModelSpec } from '../electron/model/bundled'

vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, statfs: vi.fn(actual.statfs) }
})
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) }
})

const model = Buffer.from('GGUF independently specified offline fixture')
const license = Buffer.from('fixture license\n')
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const spec: BundledModelSpec = {
  version: 'fixture-v1',
  model: { name: 'fixture.gguf', bytes: model.length, sha256: digest(model) },
  metadata: [{ name: 'LICENSE', bytes: license.length, sha256: digest(license) }],
}
let root: string, source: string, target: string
beforeEach(async () => {
  const base = resolve(__dirname, '../../tmp/tests')
  await mkdir(base, { recursive: true })
  root = await mkdtemp(join(base, 'offline-'))
  source = join(root, 'read-only-app-resources')
  target = join(root, 'user-data', 'models')
  await mkdir(source)
  await writeFile(join(source, 'fixture.gguf'), model)
  await writeFile(join(source, 'LICENSE'), license)
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
const install = (signal?: AbortSignal) => installBundledModel({ packageDir: source, modelsDir: target, spec, signal })

describe('offline model installation', () => {
  it('installs verified bytes and license outside the app without changing its payload', async () => {
    await expect(install()).resolves.toBe('installed')
    expect(await readFile(join(target, 'fixture.gguf'))).toEqual(model)
    expect(await readFile(join(target, 'licenses', 'fixture-v1', 'LICENSE'))).toEqual(license)
    expect(await readFile(join(source, 'fixture.gguf'))).toEqual(model)
    expect((await readdir(target)).sort()).toEqual(['fixture.gguf', 'licenses'])
  })
  it('preserves the installed model when a later lean app has no bundled payload', async () => {
    await install()
    const before = await stat(join(target, 'fixture.gguf'))
    await rm(source, { recursive: true })
    await expect(install()).resolves.toBe('not-bundled')
    expect(await readFile(join(target, 'fixture.gguf'))).toEqual(model)
    expect((await stat(join(target, 'fixture.gguf'))).mtimeMs).toBe(before.mtimeMs)
    expect(await readFile(join(target, 'licenses', 'fixture-v1', 'LICENSE'))).toEqual(license)
  })
  it('does not reinstall an already verified model, even if the original payload is damaged', async () => {
    await install()
    const before = await stat(join(target, 'fixture.gguf'))
    await writeFile(join(source, 'fixture.gguf'), 'broken')
    await expect(install()).resolves.toBe('already-installed')
    expect((await stat(join(target, 'fixture.gguf'))).mtimeMs).toBe(before.mtimeMs)
  })
  it.each(['truncated', 'same-size-corruption', 'missing-license', 'bad-license', 'symlink', 'extra-file'])
  ('rejects %s and preserves the previous model until a whole valid copy is ready', async fault => {
    await mkdir(target, { recursive: true })
    const old = Buffer.from('previous installed bytes')
    await writeFile(join(target, 'fixture.gguf'), old)
    if (fault === 'truncated') await writeFile(join(source, 'fixture.gguf'), model.subarray(0, 4))
    if (fault === 'same-size-corruption') await writeFile(join(source, 'fixture.gguf'), Buffer.alloc(model.length, 7))
    if (fault === 'missing-license') await rm(join(source, 'LICENSE'))
    if (fault === 'bad-license') await writeFile(join(source, 'LICENSE'), Buffer.alloc(license.length, 7))
    if (fault === 'symlink') {
      await rm(join(source, 'fixture.gguf'))
      await writeFile(join(root, 'outside.gguf'), model)
      await symlink(join(root, 'outside.gguf'), join(source, 'fixture.gguf'))
    }
    if (fault === 'extra-file') await writeFile(join(source, 'unapproved.gguf'), model)
    await expect(install()).rejects.toThrow()
    expect(await readFile(join(target, 'fixture.gguf'))).toEqual(old)
    expect((await readdir(target)).some(name => name.includes('importing'))).toBe(false)
  })
  it('rejects insufficient disk capacity before copying and keeps the existing file', async () => {
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'fixture.gguf'), 'old')
    vi.mocked(statfs).mockResolvedValueOnce({ bavail: 0, bsize: 4096 } as Awaited<ReturnType<typeof statfs>>)
    await expect(install()).rejects.toThrow(/space/i)
    expect(await readFile(join(target, 'fixture.gguf'), 'utf8')).toBe('old')
    expect(await readdir(target)).toEqual(['fixture.gguf'])
  })
  it('does not commit a cancelled copy; an interrupted prior staging directory is cleaned on retry', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(install(controller.signal)).rejects.toThrow()
    await mkdir(join(target, '.offline-importing'), { recursive: true })
    await writeFile(join(target, '.offline-importing', 'partial'), 'interrupted')
    await expect(install()).resolves.toBe('installed')
    expect((await readdir(target)).some(name => name.includes('importing'))).toBe(false)
  })
  it('repairs a same-size corrupt destination from the verified offline payload', async () => {
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'fixture.gguf'), Buffer.alloc(model.length, 7))
    await expect(install()).resolves.toBe('installed')
    expect(await readFile(join(target, 'fixture.gguf'))).toEqual(model)
  })
  it('aborts after a copy chunk has been read and removes partial bytes without changing the old model', async () => {
    const controller = new AbortController()
    const realFs = await vi.importActual<typeof import('fs')>('fs')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'fixture.gguf'), 'old')
    let bytesRead = 0
    vi.mocked(createReadStream).mockImplementationOnce((...args) => {
      const stream = realFs.createReadStream(...args)
      stream.once('data', chunk => { bytesRead += chunk.length; controller.abort() })
      return stream
    })
    await expect(install(controller.signal)).rejects.toThrow()
    expect(bytesRead).toBeGreaterThan(0)
    expect(await readFile(join(target, 'fixture.gguf'), 'utf8')).toBe('old')
    expect(await readdir(target)).toEqual(['fixture.gguf'])
  })
  it('keeps the actionable bootstrap failure until import recovery or a successful model load', () => {
    setBundledModelError('Insufficient disk space for offline model installation')
    expect(modelSetupError({ modelLoaded: false, error: 'Local model or native runtime missing' })).toMatch(/disk space/)
    expect(modelSetupError({ modelLoaded: true })).toBeUndefined()
    setBundledModelError()
    expect(modelSetupError({ modelLoaded: false, error: 'runtime error' })).toBe('runtime error')
  })
  it('leaves a fresh lean install available for rules without creating a model', async () => {
    await rm(source, { recursive: true })
    await expect(install()).resolves.toBe('not-bundled')
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
