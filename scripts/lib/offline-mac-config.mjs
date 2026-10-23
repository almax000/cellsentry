import { join } from 'node:path'

/** Separate .apps with the same version; only future, higher App versions are updates. */
export function offlineMacConfigs({ baseConfig, appDir, nativeDir, packageDir, outputRoot }) {
  const common = {
    // electron-builder concatenates arrays in extends. Materialize a complete
    // config instead, or the offline DMG would silently also generate a huge ZIP.
    ...structuredClone(baseConfig),
    extends: null,
    directories: { ...baseConfig.directories, app: appDir, buildResources: join(appDir, 'resources') },
    mac: { ...baseConfig.mac, extraResources: [{ from: nativeDir, to: 'native/darwin-${arch}' }] },
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
