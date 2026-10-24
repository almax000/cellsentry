import { describe, expect, it } from 'vitest'
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Build tooling is a native Node module outside the application compilation.
import { offlineMacConfigs } from '../../scripts/lib/offline-mac-config.mjs'
// @ts-expect-error Packaged-app acceptance helper is CommonJS tooling outside application compilation.
import { verifyPackagedNativeRuntime } from '../../scripts/lib/packaged-native-runtime.cjs'

describe('full first install and independent App updates', () => {
  it('keeps the model in the offline app and keeps the update ZIP physically separate', () => {
    const baseConfig = { mac: { target: ['dmg', 'zip'], extraResources: [{ from: '../native/darwin-${arch}' }] } }
    const config = offlineMacConfigs({ baseConfig, appDir: '/stage/app',
      nativeDir: '/root/native/darwin-arm64', packageDir: '/stage/verified-package', outputRoot: '/stage/build' })
    expect(config.offline.mac.target).toEqual(['dmg'])
    expect(config.update.mac.target).toEqual(['zip'])
    expect(config.offline.mac.extraResources).toContainEqual({ from: '/stage/verified-package', to: 'offline-model' })
    const auditNativeRuntime = {
      from: '/root/native/darwin-arm64',
      to: 'native/darwin-${arch}',
      filter: ['**/*', '!cellsentry-docreader', '!cellsentry-docreader/**'],
    }
    expect(config.offline.mac.extraResources).toContainEqual(auditNativeRuntime)
    expect(config.update.mac.extraResources).toEqual([auditNativeRuntime])
    expect(config.offline.directories.output).not.toBe(config.update.directories.output)
    expect(config.offline.extends).toBeNull()
    expect(config.update.extends).toBeNull()
    expect(baseConfig.mac.target).toEqual(['dmg', 'zip'])
    expect(JSON.stringify(config)).not.toContain('extraMetadata') // both variants keep the same release version
  })

  const release = (env: Record<string, string>, mac: Record<string, unknown> = {}) => offlineMacConfigs({
    baseConfig: { mac }, appDir: '/stage/app', nativeDir: '/stage/native',
    packageDir: '/stage/package', outputRoot: '/stage/output', release: true, env,
  })

  it('rejects a release without notarization authentication instead of silently skipping it', () => {
    expect(() => release({})).toThrow(/notarization authentication/i)
  })

  it('requires Developer ID distribution signing, hardened runtime and notarization for both variants', () => {
    const configs = release({ APPLE_KEYCHAIN_PROFILE: 'synthetic-profile' }, { notarize: false, hardenedRuntime: false })
    for (const config of Object.values(configs) as Array<{ forceCodeSigning: boolean; mac: Record<string, unknown> }>) {
      expect(config.forceCodeSigning).toBe(true)
      expect(config.mac).toMatchObject({ type: 'distribution', hardenedRuntime: true, notarize: true })
    }
    expect(JSON.stringify(configs)).not.toContain('synthetic-profile')
  })

  it.each([null, '-'])('rejects the non-distribution signing identity %s', identity => {
    expect(() => release({ APPLE_KEYCHAIN_PROFILE: 'synthetic-profile' }, { identity })).toThrow(/identity/i)
  })

  it('rejects partial Apple ID authentication even when a keychain profile is also configured', () => {
    expect(() => release({ APPLE_ID: 'synthetic@example.invalid', APPLE_KEYCHAIN_PROFILE: 'synthetic-profile' })).toThrow(/APPLE_APP_SPECIFIC_PASSWORD/)
  })

  it('rejects partial API authentication and accepts a complete environment without serializing it', () => {
    expect(() => release({ APPLE_API_KEY: '/synthetic/AuthKey.p8' })).toThrow(/APPLE_API_KEY_ID/)
    const configs = release({ APPLE_API_KEY: '/synthetic/AuthKey.p8', APPLE_API_KEY_ID: 'SYNTHETIC0', APPLE_API_ISSUER: 'synthetic-issuer' })
    expect(configs.offline.forceCodeSigning).toBe(true)
    expect(JSON.stringify(configs)).not.toContain('AuthKey.p8')
  })
})

describe('packaged audit runtime acceptance', () => {
  async function fixture(options: { executable?: string; createExecutable?: boolean; docreader?: string } = {}) {
    const root = await mkdtemp(join(tmpdir(), 'cellsentry-packaged-runtime-'))
    const executable = options.executable ?? 'llama-b11429/llama-server'
    await writeFile(join(root, 'runtime.json'), JSON.stringify({ executable }))
    if (options.createExecutable !== false && !executable.startsWith('..')) {
      const binary = join(root, executable)
      await mkdir(join(binary, '..'), { recursive: true })
      await writeFile(binary, '#!/bin/sh\nexit 0\n')
      await chmod(binary, 0o755)
    }
    if (options.docreader) {
      const path = join(root, options.docreader)
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, 'not allowed')
    }
    return root
  }

  async function withFixture(options: Parameters<typeof fixture>[0], assertion: (root: string) => Promise<void>) {
    const root = await fixture(options)
    try { await assertion(root) } finally { await rm(root, { recursive: true, force: true }) }
  }

  it('accepts a versioned runtime directory named by runtime.json', async () => {
    await withFixture({}, async root => {
      await expect(verifyPackagedNativeRuntime(root)).resolves.toBe(join(root, 'llama-b11429/llama-server'))
    })
  })

  it('rejects a manifest whose executable is missing or escapes the runtime root', async () => {
    await withFixture({ createExecutable: false }, async root => {
      await expect(verifyPackagedNativeRuntime(root)).rejects.toThrow(/executable missing/)
    })
    await withFixture({ executable: '../llama-server', createExecutable: false }, async root => {
      await expect(verifyPackagedNativeRuntime(root)).rejects.toThrow(/must be relative|escapes/)
    })
  })

  it('rejects a document reader anywhere in the packaged native runtime', async () => {
    await withFixture({ docreader: 'legacy/cellsentry-docreader' }, async root => {
      await expect(verifyPackagedNativeRuntime(root)).rejects.toThrow(/document reader must not be packaged/)
    })
  })

  it('rejects an executable reached through an external directory link', async () => {
    await withFixture({}, async root => {
      const outside = await mkdtemp(join(tmpdir(), 'cellsentry-outside-runtime-'))
      try {
        await writeFile(join(outside, 'llama-server'), '#!/bin/sh\nexit 0\n')
        await chmod(join(outside, 'llama-server'), 0o755)
        await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
        await writeFile(join(root, 'runtime.json'), JSON.stringify({ executable: 'escape/llama-server' }))
        await expect(verifyPackagedNativeRuntime(root)).rejects.toThrow(/escapes/)
      } finally { await rm(outside, { recursive: true, force: true }) }
    })
  })

  it('rejects an external linked folder that would hide a document reader', async () => {
    await withFixture({}, async root => {
      const outside = await mkdtemp(join(tmpdir(), 'cellsentry-outside-docreader-'))
      try {
        await writeFile(join(outside, 'cellsentry-docreader'), 'not allowed')
        await symlink(outside, join(root, 'legacy'), process.platform === 'win32' ? 'junction' : 'dir')
        await expect(verifyPackagedNativeRuntime(root)).rejects.toThrow(/escapes|document reader/)
      } finally { await rm(outside, { recursive: true, force: true }) }
    })
  })

  it('accepts directory links that remain inside the runtime', async () => {
    await withFixture({}, async root => {
      await symlink(join(root, 'llama-b11429'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
      await expect(verifyPackagedNativeRuntime(root)).resolves.toBe(join(root, 'llama-b11429/llama-server'))
    })
  })

  it.skipIf(process.platform === 'win32')('rejects a binary without POSIX execute permission', async () => {
    await withFixture({}, async root => {
      await chmod(join(root, 'llama-b11429/llama-server'), 0o644)
      await expect(verifyPackagedNativeRuntime(root)).rejects.toThrow(/not executable/)
    })
  })
})
