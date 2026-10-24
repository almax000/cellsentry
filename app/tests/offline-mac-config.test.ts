import { describe, expect, it } from 'vitest'
// @ts-expect-error Build tooling is a native Node module outside the application compilation.
import { offlineMacConfigs } from '../../scripts/lib/offline-mac-config.mjs'

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
