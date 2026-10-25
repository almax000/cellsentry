#!/usr/bin/env node
// Opt-in production-path acceptance. Changes no proxy, network or signing configuration.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } = require('node:fs')
const { basename, join, resolve, sep } = require('node:path')
const { parseArgs } = require('node:util')
const { _electron: electron, expect } = require('../app/node_modules/@playwright/test')
const { verifyPackagedNativeRuntime } = require('./lib/packaged-native-runtime.cjs')

const { values } = parseArgs({ options: {
  'offline-app': { type: 'string' }, 'lean-app': { type: 'string' }, out: { type: 'string' },
} })
const root = realpathSync(resolve(__dirname, '..'))
const out = resolve(values.out || '')
assert.equal(process.platform, 'darwin', 'This acceptance is for macOS bundles')
assert(values['offline-app'] && values['lean-app'] && out.startsWith(join(root, 'tmp') + sep), 'Use --offline-app <app> --lean-app <app> --out <new repo tmp directory>')
for (const name of ['CELLSENTRY_LLAMA_SERVER', 'CELLSENTRY_MODEL_DIR']) assert(!process.env[name], `Refusing ${name} override`)
assert(!execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' }).split('\n').some(line => /CellSentry[^/]*\.app\/Contents\/MacOS\//.test(line)), 'Close other CellSentry instances before isolated acceptance')
assert.equal(realpathSync(resolve(out, '..')), resolve(out, '..'), 'Use a physical output parent')
mkdirSync(out) // Never overwrite an existing acceptance or profile.
const profile = join(out, 'profile')
mkdirSync(profile)
writeFileSync(join(profile, '.cellsentry-automation'), 'isolated automation profile\n', { flag: 'wx' })
const report = {
  launches: [], checks: [],
  networkScope: 'Chromium NetLog starts via CLI; lsof snapshots cover main and native sockets after attachment. Node/native transient connections and OS services are not exhaustively captured.',
  globalNetworkVerified: false, realUpdaterInstallationVerified: false, signingVerified: false,
}

async function sha256(path) {
  const digest = createHash('sha256')
  for await (const bytes of createReadStream(path)) digest.update(bytes)
  return digest.digest('hex')
}

function socketSnapshot(mainPid) {
  // Read only executable names, never command arguments (native argv contains an ephemeral API key).
  const processes = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' }).split('\n').map(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
    return match && { pid: Number(match[1]), parent: Number(match[2]), command: match[3] }
  }).filter(Boolean)
  const native = processes.filter(process => process.parent === mainPid && basename(process.command) === 'llama-server')
  const pids = [mainPid, ...native.map(process => process.pid)]
  let output
  try {
    output = execFileSync('/usr/sbin/lsof', ['-nP', '-a', '-p', pids.join(','), '-iTCP', '-iUDP', '-Fpcn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    if (error.status !== 1 || error.stderr?.length) throw error
    output = String(error.stdout || '')
  }
  const endpoints = output.split('\n').filter(line => line.startsWith('n')).map(line => line.slice(1))
  const external = endpoints.filter(endpoint => !endpoint.split('->').every(part => /^(127\.0\.0\.1|\[::1\]):\d+$/.test(part)))
  return { nativePids: native.map(process => process.pid), endpoints, external }
}

function summarizeNetLog(path) {
  const log = JSON.parse(readFileSync(path, 'utf8'))
  assert(Array.isArray(log.events) && log.events.length > 0 && log.constants?.logEventTypes, 'Missing Chromium startup NetLog events')
  const urls = log.events.flatMap(event => typeof event.params?.url === 'string' ? [event.params.url] : [])
  const networkUrls = [...new Set(urls.filter(url => /^(https?|wss?):/.test(url)))]
  const externalHosts = [...new Set(networkUrls.map(url => new URL(url).hostname).filter(host => !['127.0.0.1', 'localhost', '[::1]'].includes(host)))]
  return { events: log.events.length, networkUrlCount: networkUrls.length, externalUrlHosts: externalHosts,
    scope: 'URL-bearing Chromium events only; raw log retained locally for independent review' }
}

async function launch(appPath, label) {
  const executable = join(appPath, 'Contents/MacOS', basename(appPath, '.app'))
  assert(existsSync(executable) && existsSync(join(appPath, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')))
  await verifyPackagedNativeRuntime(join(appPath, 'Contents/Resources/native', `darwin-${process.arch}`))
  const netLogPath = join(out, `${label}-chromium-netlog.json`)
  const application = await electron.launch({ executablePath: executable, timeout: 120_000,
    args: [`--log-net-log=${netLogPath}`, '--net-log-capture-mode=Default'], env: {
      ...process.env, NODE_ENV: 'production', CELLSENTRY_TEST_MODE: '0', CELLSENTRY_TEST_USER_DATA: '',
      CELLSENTRY_AUTOMATION_MODE: '1', CELLSENTRY_AUTOMATION_HIDDEN: '1', CELLSENTRY_AUTOMATION_USER_DATA: profile,
    } })
  const errors = []
  const snapshots = []
  const started = Date.now()
  let identity
  let result
  try {
    identity = await application.evaluate(({ app, netLog }) => ({ packaged: app.isPackaged, version: app.getVersion(),
      userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), sessionNetLogging: netLog.currentlyLogging,
      cliNetLog: app.commandLine.getSwitchValue('log-net-log'), pid: process.pid }))
    report.launches.push({ label, identity, completed: false })
    assert(identity.packaged)
    assert.equal(identity.cliNetLog, netLogPath)
    assert.equal(identity.userData, profile)
    assert.equal(identity.sessionData, join(profile, 'chromium'))
    const page = await application.firstWindow()
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByTestId('home-task-audit')).toBeVisible()
    assert.deepEqual(await page.evaluate(() => [typeof window.__TEST_API__, typeof window.api.onTestTriggerAnalysis, typeof window.api.onTestResetState]), ['undefined', 'undefined', 'undefined'])
    // Poll status only: calling startLlm here would hide a broken production warmup.
    await expect.poll(async () => {
      snapshots.push(socketSnapshot(identity.pid))
      return page.evaluate(() => window.api.getLlmStatus().then(status => status.modelLoaded))
    }, { timeout: 120_000, intervals: [250, 500, 1000] }).toBe(true)
    const modelStatus = await page.evaluate(() => window.api.getModelStatus())
    assert.equal(modelStatus.exists, true)
    assert.equal(modelStatus.downloadAvailable, false)
    assert(!['copying', 'verifying', 'failed'].includes(modelStatus.setup.phase))
    for (let sample = 0; sample < 4; sample++) {
      snapshots.push(socketSnapshot(identity.pid))
      await page.waitForTimeout(750)
    }
    assert(snapshots.some(snapshot => snapshot.nativePids.length === 1), 'Real native child not observed')
    assert.deepEqual(snapshots.flatMap(snapshot => snapshot.external), [], 'Non-loopback socket observed')
    assert(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible() && !window.isFocused())))
    await page.screenshot({ path: join(out, `${label}-home.png`), animations: 'disabled' })
    assert.deepEqual(errors, [])
    result = { label, identity, automaticNativeModelLoaded: true, testApiAbsent: true,
      hidden: true, milliseconds: Date.now() - started, socketSnapshots: snapshots, errors }
  } finally { await application.close() }
  // The CLI capture is process-wide, distinct from the session netLog API.
  // Let process exit flush its complete startup/shutdown record before parsing.
  const netLog = summarizeNetLog(netLogPath)
  assert.deepEqual(netLog.externalUrlHosts, [], 'External URL found in startup Chromium NetLog')
  Object.assign(report.launches.at(-1), result, { netLog, completed: true })
}

async function main() {
  const offline = realpathSync(values['offline-app']), lean = realpathSync(values['lean-app'])
  const source = join(offline, 'Contents/Resources/offline-model')
  const { canonicalSpec, verifyReleaseDirectory } = await import('./lib/stage-model-package.mjs')
  await verifyReleaseDirectory({ outDir: source, spec: await canonicalSpec(root) })
  await launch(offline, 'offline-first-start')
  const fileName = 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf'
  const installed = join(profile, 'models', fileName)
  const expectedSha = '61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a'
  assert.equal(statSync(installed).size, 1561314592)
  assert.equal(await sha256(installed), expectedSha)
  const mtime = statSync(installed).mtimeMs
  assert(!existsSync(join(lean, 'Contents/Resources/offline-model')))
  await launch(lean, 'lean-reuse')
  assert.equal(statSync(installed).mtimeMs, mtime)
  assert.equal(await sha256(installed), expectedSha)
  report.checks.push('production first start and lean reuse automatically load real bundled model without test APIs or manual start',
    'model SHA256 and mtime preserved', 'no external URL in CLI Chromium log; sampled main/native sockets were loopback only')
  writeFileSync(join(out, 'receipt.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: true, launches: report.launches.length, globalNetworkVerified: false }))
}
main().catch(error => {
  report.error = error.message
  writeFileSync(join(out, 'failure.json'), JSON.stringify(report, null, 2) + '\n')
  console.error(error.stack)
  process.exitCode = 1
})
