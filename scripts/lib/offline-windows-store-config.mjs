import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

const REQUIRED_IDENTITY_FIELDS = ['identityName', 'publisher', 'publisherDisplayName']
const PROBE_VALUES = new Set([
  'CellSentry.MsixProbe',
  'CN=CellSentryMSIXProbe',
  'CN=ms',
  'CellSentry MSIX development probe',
  'assigned-by-microsoft',
  'CN=assigned-by-microsoft',
])
const PLACEHOLDER = /(?:probe|placeholder|template|your[._ -]?identity|example|default)/i
const UNSAFE_XML_OR_CONTROL = /[\u0000-\u001f\u007f<>&"']/

function requireAbsolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${name} requires an absolute path`)
  return value
}

function requirePublicIdentityValue(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Missing Store ${name}`)
  if (value !== value.trim()) throw new Error(`Store ${name} must not have surrounding whitespace`)
  if (UNSAFE_XML_OR_CONTROL.test(value)) throw new Error(`Store ${name} contains unsafe XML or control characters`)
  if (PROBE_VALUES.has(value) || PLACEHOLDER.test(value)) throw new Error(`Store ${name} must not use a probe, default, or template value`)
  return value
}

/** Parse only the public Microsoft Store identity fields; this does not prove Microsoft has approved them. */
export async function readWindowsStoreIdentityProfile(profilePath) {
  requireAbsolutePath(profilePath, '--identity-profile')
  let parsed
  try {
    parsed = JSON.parse(await readFile(profilePath, 'utf8'))
  } catch (error) {
    throw new Error('Could not read a valid public Store identity profile')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Store identity profile must be a JSON object')
  const keys = Object.keys(parsed).sort()
  if (JSON.stringify(keys) !== JSON.stringify([...REQUIRED_IDENTITY_FIELDS].sort())) {
    throw new Error('Store identity profile must contain only identityName, publisher, and publisherDisplayName')
  }
  return validateWindowsStoreIdentity(parsed)
}

export function validateWindowsStoreIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new Error('Missing Store identity')
  const result = Object.fromEntries(REQUIRED_IDENTITY_FIELDS.map(name => [name, requirePublicIdentityValue(identity[name], name)]))
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(result.identityName)) throw new Error('Store identityName must contain 3–50 alphanumeric, period, or dash characters')
  if (!/^CN=\S.+$/.test(result.publisher)) throw new Error('Store publisher must be the explicit CN distinguished name from Partner Center')
  return result
}

/** Store packages must use an explicit major.minor.patch version; AppXTarget adds fourth component 0. */
export function validateWindowsStoreVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Store version must be an explicit three-part numeric major.minor.patch value')
  }
  const parts = version.split('.').map(Number)
  if (parts[0] <= 0 || parts.some(part => !Number.isSafeInteger(part) || part < 0 || part > 65535)) {
    throw new Error('Store version components must be integers from 0 through 65535, with major greater than zero')
  }
  return version
}

/**
 * A complete, non-inherited Store config. Store first installs always include
 * the verified model; this deliberately has no lean/update variant.
 */
export function offlineWindowsStoreConfig({ appDir, modelPackageDir, nativeDir, outputDir, identity, version }) {
  const app = requireAbsolutePath(appDir, '--app-dir')
  const modelPackage = requireAbsolutePath(modelPackageDir, '--model-package')
  const native = requireAbsolutePath(nativeDir, '--native-dir')
  const output = requireAbsolutePath(outputDir, '--out')
  const storeIdentity = validateWindowsStoreIdentity(identity)
  const storeVersion = validateWindowsStoreVersion(version)

  return {
    // Do not inherit electron-builder.yml: its arrays/publish/NSIS settings are
    // inappropriate for a single, self-contained Microsoft Store candidate.
    extends: null,
    appId: 'com.cellsentry.app',
    productName: 'CellSentry Beta',
    directories: {
      app,
      buildResources: join(app, 'resources'),
      output,
    },
    files: [
      '!**/.vscode/*', '!src/*', '!e2e/**', '!tests/**', '!tmp/**', '!shared/**', '!electron/**',
      '!vitest.config.*', '!electron.vite.config.*', '!playwright.config.*',
      '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
      '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}',
    ],
    extraMetadata: { version: storeVersion },
    publish: null,
    forceCodeSigning: false,
    win: {
      signAndEditExecutable: false,
      target: [{ target: 'appx', arch: ['x64'] }],
      icon: 'resources/icon.ico',
      extraResources: [
        { from: native, to: 'native/win32-x64' },
        { from: modelPackage, to: 'offline-model' },
      ],
    },
    appx: {
      identityName: storeIdentity.identityName,
      publisher: storeIdentity.publisher,
      publisherDisplayName: storeIdentity.publisherDisplayName,
      displayName: 'CellSentry',
      applicationId: 'CellSentry',
      languages: ['en-US', 'zh-CN'],
      minVersion: '10.0.19041.0',
      maxVersionTested: '10.0.26100.0',
      electronUpdaterAware: false,
      setBuildNumber: false,
    },
  }
}
