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
    expect(config.update.mac.extraResources).toEqual([{ from: '/root/native/darwin-arm64', to: 'native/darwin-${arch}' }])
    expect(config.offline.directories.output).not.toBe(config.update.directories.output)
    expect(config.offline.extends).toBeNull()
    expect(config.update.extends).toBeNull()
    expect(baseConfig.mac.target).toEqual(['dmg', 'zip'])
    expect(JSON.stringify(config)).not.toContain('extraMetadata') // both variants keep the same release version
  })
})
