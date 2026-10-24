import { join } from 'node:path'

/** Matches the installed electron-builder 25 authentication precedence; never returns credentials. */
export function requireMacNotarization(env = process.env) {
  const present = name => typeof env[name] === 'string' && env[name].trim().length > 0
  const requireAll = names => {
    const missing = names.filter(name => !present(name))
    if (missing.length) throw new Error(`Missing notarization authentication variables: ${missing.join(', ')}`)
  }
  if (present('APPLE_ID') || present('APPLE_APP_SPECIFIC_PASSWORD')) {
    requireAll(['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
    return 'apple-id'
  }
  if (['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'].some(present)) {
    requireAll(['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
    return 'api-key'
  }
  if (present('APPLE_KEYCHAIN_PROFILE')) return 'keychain'
  throw new Error('Missing notarization authentication: configure APPLE_KEYCHAIN_PROFILE, Apple ID variables, or App Store Connect API variables')
}

/** Separate .apps with the same version; only future, higher App versions are updates. */
export function offlineMacConfigs({ baseConfig, appDir, nativeDir, packageDir, outputRoot, release = false, env = process.env }) {
  if (release) {
    requireMacNotarization(env)
    if (baseConfig.mac?.identity === null || baseConfig.mac?.identity === '-') {
      throw new Error('A release requires a Developer ID Application signing identity')
    }
  }
  const common = {
    // electron-builder concatenates arrays in extends. Materialize a complete
    // config instead, or the offline DMG would silently also generate a huge ZIP.
    ...structuredClone(baseConfig),
    extends: null,
    ...(release ? { forceCodeSigning: true } : {}),
    directories: { ...baseConfig.directories, app: appDir, buildResources: join(appDir, 'resources') },
    mac: { ...baseConfig.mac,
      ...(release ? { type: 'distribution', hardenedRuntime: true, notarize: true } : {}),
      extraResources: [{
        from: nativeDir,
        to: 'native/darwin-${arch}',
        filter: ['**/*', '!cellsentry-docreader', '!cellsentry-docreader/**'],
      }] },
  }
  return {
    offline: {
      ...common,
      directories: { ...common.directories, output: join(outputRoot, 'offline') },
      mac: { ...common.mac, target: ['dmg'],
        artifactName: 'CellSentry-${version}-${arch}-offline.${ext}',
        extraResources: [...common.mac.extraResources, { from: packageDir, to: 'offline-model' }] },
    },
    update: {
      ...common,
      directories: { ...common.directories, output: join(outputRoot, 'update') },
      mac: { ...common.mac, target: ['zip'], artifactName: 'CellSentry-${version}-${arch}.${ext}' },
    },
  }
}
