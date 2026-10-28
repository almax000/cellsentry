import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
// @ts-expect-error Build tooling is a native Node module outside the application compilation.
import { offlineWindowsStoreConfig } from '../../scripts/lib/offline-windows-store-config.mjs'

const validIdentity = {
  identityName: '12345CellSentry.CellSentry',
  publisher: 'CN=01234567-89ab-cdef-0123-456789abcdef',
  publisherDisplayName: 'CellSentry',
}

function config(overrides: Record<string, unknown> = {}) {
  return offlineWindowsStoreConfig({
    appDir: '/stage/cellsentry-store-app',
    modelPackageDir: '/stage/formula-cancellation-v2',
    nativeDir: '/stage/native/win32-x64',
    outputDir: '/stage/windows-store-offline',
    identity: validIdentity,
    version: '1.24.7',
    ...overrides,
  })
}

describe('Windows Store offline candidate configuration', () => {
  it('always makes the x64 Store candidate self-contained with native runtime and verified model package', () => {
    const candidate = config()

    expect(candidate.extends).toBeNull()
    expect(candidate.appId).toBe('com.cellsentry.app')
    expect(candidate.productName).toBe('CellSentry Beta')
    expect(candidate.directories).toEqual({
      app: '/stage/cellsentry-store-app',
      buildResources: join('/stage/cellsentry-store-app', 'resources'),
      output: '/stage/windows-store-offline',
    })
    expect(candidate.win.target).toEqual([{ target: 'appx', arch: ['x64'] }])
    expect(candidate.win.extraResources).toEqual([
      { from: '/stage/native/win32-x64', to: 'native/win32-x64' },
      { from: '/stage/formula-cancellation-v2', to: 'offline-model' },
    ])
    expect(candidate.appx).toMatchObject({
      identityName: validIdentity.identityName,
      publisher: validIdentity.publisher,
      publisherDisplayName: validIdentity.publisherDisplayName,
      displayName: 'CellSentry',
      applicationId: 'CellSentry',
      electronUpdaterAware: false,
      setBuildNumber: false,
    })
    expect(candidate.extraMetadata).toEqual({ version: '1.24.7' })
  })

  it('has no inherited updater, GitHub publishing, or NSIS configuration', () => {
    const candidate = config()
    expect(candidate.publish).toBeNull()
    expect(candidate.forceCodeSigning).toBe(false)
    expect(candidate.win.signAndEditExecutable).toBe(false)
    expect(JSON.stringify(candidate)).not.toContain('github')
    expect(candidate).not.toHaveProperty('nsis')
    expect(candidate.win).not.toHaveProperty('target.nsis')
  })

  it.each([
    [{ ...validIdentity, identityName: '' }],
    [{ ...validIdentity, publisher: '' }],
    [{ ...validIdentity, publisherDisplayName: '' }],
    [{ ...validIdentity, identityName: 'Bad Identity With Spaces' }],
    [{ ...validIdentity, publisher: 'not-a-publisher-distinguished-name' }],
    [{ ...validIdentity, identityName: 'assigned-by-microsoft' }],
    [{ identityName: 'CellSentry.MsixProbe', publisher: 'CN=CellSentryMSIXProbe', publisherDisplayName: 'CellSentry MSIX development probe' }],
    [{ ...validIdentity, publisher: 'CN=ms' }],
    [{ ...validIdentity, publisher: 'CN=<unescaped>' }],
    [{ ...validIdentity, publisherDisplayName: 'CellSentry\nunsafe' }],
  ])('rejects a missing, placeholder, or development-probe Store identity', identity => {
    expect(() => config({ identity })).toThrow(/identity|publisher|placeholder|probe/i)
  })

  it.each(['0.1.1', '1.2', '1.2.3.4', '1.70000.1', '1.2.beta', '1.2.3-beta', '01.2.3'])('rejects invalid or implicit Store version %s', version => {
    expect(() => config({ version })).toThrow(/version/i)
  })

  it.each([
    { modelPackageDir: '' },
    { nativeDir: '' },
    { appDir: '' },
    { outputDir: '' },
  ])('rejects an incomplete isolated candidate path set', overrides => {
    expect(() => config(overrides)).toThrow(/absolute|app|model|native|output/i)
  })

  it('never turns the Store candidate into an architecture-conditional lean update', () => {
    const candidate = config()
    expect(candidate.win.extraResources).toContainEqual({ from: '/stage/formula-cancellation-v2', to: 'offline-model' })
    expect(candidate.win.extraResources).toContainEqual({ from: '/stage/native/win32-x64', to: 'native/win32-x64' })
    expect(JSON.stringify(candidate)).not.toContain('${arch}')
  })
})
