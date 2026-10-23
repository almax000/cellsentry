#!/usr/bin/env node
// Opt-in, hidden packaged-app acceptance. Never runs against the real user profile.
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { createReadStream, existsSync } = require('node:fs')
const { mkdir, readFile, readdir, stat, writeFile } = require('node:fs/promises')
const { basename, join, resolve } = require('node:path')
const { parseArgs } = require('node:util')
const { _electron: electron } = require('../app/node_modules/@playwright/test')

const { values } = parseArgs({ options: {
  'offline-app': { type: 'string' }, 'update-app': { type: 'string' }, out: { type: 'string' },
  'load-model': { type: 'boolean', default: false },
} })
const root = resolve(__dirname, '..')
const out = resolve(values.out || '')
if (!values['offline-app'] || !values['update-app'] || !out.startsWith(join(root, 'tmp') + '/')) {
  throw new Error('Use --offline-app <app> --update-app <app> --out <new directory under this repo tmp/> [--load-model]')
}
if (process.env.CELLSENTRY_LLAMA_SERVER) throw new Error('Acceptance requires the packaged runtime, without CELLSENTRY_LLAMA_SERVER override')
const fileName = 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf'
const expected = { bytes: 1561314592, sha256: '61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a' }
async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
const report = { checks: [], launches: [], externalRequests: [], fullModelLoaded: false,
  realUpdaterInstallationVerified: false, globalNetworkVerified: false, signingVerified: false }
async function launch(appPath, userData, loadModel, fresh = false) {
  const executable = join(appPath, 'Contents/MacOS', basename(appPath, '.app'))
  assert(existsSync(executable), 'packaged executable missing')
  assert(existsSync(join(appPath, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')), 'Electron Framework missing; refusing to launch')
  const started = Date.now()
  const application = await electron.launch({ executablePath: executable, timeout: 120_000, env: {
    ...process.env, NODE_ENV: 'production', CELLSENTRY_TEST_MODE: '1', CELLSENTRY_TEST_HIDDEN: '1',
    CELLSENTRY_TEST_USER_DATA: userData, CELLSENTRY_MODEL_DIR: join(userData, 'models'),
    CELLSENTRY_TEST_BUNDLED_MODEL: '1',
  } })
  try {
    await application.evaluate(({ session, dialog }) => {
      globalThis.__offlineExternalHosts = []
      globalThis.__offlineDialogCalls = 0
      dialog.showOpenDialog = async () => {
        globalThis.__offlineDialogCalls += 1
        return { canceled: true, filePaths: [] }
      }
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url)
        const external = ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        if (external) globalThis.__offlineExternalHosts.push(url.hostname)
        callback({ cancel: external }) // Block external requests without touching proxy settings.
      })
    })
    const page = await application.firstWindow({ timeout: 120_000 })
    await page.waitForLoadState('domcontentloaded')
    await page.getByTestId('home-task-pii').waitFor({ state: 'visible' })
    const firstWindowMilliseconds = Date.now() - started
    const identity = await application.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged, version: app.getVersion(), userData: app.getPath('userData'),
      hidden: BrowserWindow.getAllWindows().every(window => !window.isVisible()),
    }))
    assert(identity.packaged && identity.hidden)
    assert.equal(identity.userData, userData)
    const initial = await page.evaluate(() => window.api.getModelStatus())
    if (fresh) {
      assert(['copying', 'verifying'].includes(initial.setup.phase), 'fresh UI must be usable before model preparation finishes')
      const start = await page.evaluate(() => window.api.startLlm())
      assert.equal(start.reason, 'model-preparing')
      assert.equal(start.modelLoaded, false)
      const imported = await page.evaluate(() => window.api.importModel())
      assert.equal(imported.success, false)
      assert.match(imported.error, /preparation is in progress/)
      assert.equal(await application.evaluate(() => globalThis.__offlineDialogCalls), 0)
      const downloaded = await page.evaluate(() => window.api.downloadModel())
      assert.equal(downloaded.success, false)
      await page.getByTestId('model-setup-status').waitFor({ state: 'visible' })
      await page.screenshot({ path: join(out, 'fresh-preparation.png'), animations: 'disabled' })
      await page.getByTestId('home-task-pii').click()
      await page.getByTestId('redact-paste-toggle').click()
      await page.getByTestId('redact-paste-input').fill('联系电话：13912345678')
      await page.getByTestId('redact-paste-start').click()
      await page.getByTestId('redact-review').waitFor({ state: 'visible' })
      assert(!((await page.getByTestId('redact-preview-text').textContent()) || '').includes('13912345678'))
      report.checks.push('fresh UI and rule redaction work while real model preparation is running; import/download/start are gated')
    }
    const deadline = Date.now() + 120_000
    let status = await page.evaluate(() => window.api.getModelStatus())
    while (['copying', 'verifying'].includes(status.setup.phase)) {
      assert(Date.now() < deadline, 'model preparation exceeded the acceptance deadline')
      await new Promise(resolve => setTimeout(resolve, 250))
      status = await page.evaluate(() => window.api.getModelStatus())
    }
    report.lastModelStatus = status
    assert.equal(status.exists, true)
    assert.equal(status.downloadAvailable, false)
    if (loadModel) {
      const runtime = await page.evaluate(() => window.api.startLlm())
      assert.equal(runtime.modelLoaded, true, runtime.error || runtime.reason)
      report.fullModelLoaded = true
    }
    report.externalRequests.push(...await application.evaluate(() => globalThis.__offlineExternalHosts))
    report.launches.push({ ...identity, firstWindowMilliseconds, milliseconds: Date.now() - started,
      initialPhase: initial.setup.phase, finalPhase: status.setup.phase, modelExists: status.exists })
  } finally { await application.close() }
}

async function main() {
  await mkdir(out) // An existing profile or prior evidence is never overwritten.
  const offline = resolve(values['offline-app']), lean = resolve(values['update-app'])
  const source = join(offline, 'Contents/Resources/offline-model')
  assert.deepEqual((await readdir(source)).sort(), ['LICENSE', 'NOTICE.txt', 'SHA256SUMS', fileName, 'manifest.json'].sort())
  assert(!existsSync(join(lean, 'Contents/Resources/offline-model')))
  const { canonicalSpec, verifyReleaseDirectory } = await import('./lib/stage-model-package.mjs')
  const pinnedPackage = await canonicalSpec(root)
  await verifyReleaseDirectory({ outDir: source, spec: pinnedPackage })
  const userData = join(out, 'user-data')
  await launch(offline, userData, false, true)
  const installed = join(userData, 'models', fileName)
  assert.equal((await stat(installed)).size, expected.bytes)
  assert.equal(await hashFile(installed), expected.sha256)
  const before = (await stat(installed)).mtimeMs
  const metadata = ['LICENSE', 'NOTICE.txt', 'manifest.json', 'SHA256SUMS']
  for (const name of metadata) {
    assert.deepEqual(await readFile(join(userData, 'models/licenses/formula-cancellation-v2-20261016', name)), await readFile(join(source, name)))
  }
  report.checks.push('fresh offline payload copied and fully verified with all metadata')
  await launch(offline, userData, false)
  assert.equal((await stat(installed)).mtimeMs, before)
  report.checks.push('offline restart reused model without rewriting it')
  await launch(lean, userData, values['load-model'])
  assert.equal((await stat(installed)).mtimeMs, before)
  assert.equal(await hashFile(installed), expected.sha256)
  for (const name of metadata) assert(existsSync(join(userData, 'models/licenses/formula-cancellation-v2-20261016', name)))
  await verifyReleaseDirectory({ outDir: source, spec: pinnedPackage })
  assert.equal(report.externalRequests.length, 0)
  report.checks.push('lean app reused verified persistent model and metadata; all five source package files remained intact', 'no external requests observed after harness attachment')
  await writeFile(join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
main().catch(async error => {
  report.error = error.message
  if (existsSync(out)) await writeFile(join(out, 'failure.json'), JSON.stringify(report, null, 2) + '\n')
  console.error(error.stack)
  process.exitCode = 1
})
