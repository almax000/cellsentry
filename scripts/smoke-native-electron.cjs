/* Real local model smoke. Run with Electron so the production net transport is exercised. */
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const root = path.resolve(__dirname, '..')
const esbuild = require(path.join(root, 'app/node_modules/esbuild'))
const outputDir = path.join(root, '.runtime/tests')
fs.mkdirSync(outputDir, { recursive: true })
app.setPath('userData', path.join(outputDir, 'electron-smoke-profile'))
esbuild.buildSync({ entryPoints: [path.join(root, 'app/electron/llm/native.ts')],
  outfile: path.join(outputDir, 'native-electron.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
const { NativeLlmRuntime } = require(path.join(outputDir, 'native-electron.cjs'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ios/CellSentryPhone/Resources/model.json')))
const modelPath = process.env.CELLSENTRY_SMOKE_MODEL || path.join(root, 'models', manifest.filename)
const modelSha256 = process.env.CELLSENTRY_SMOKE_SHA256 || manifest.sha256
const alternateModel = !!process.env.CELLSENTRY_SMOKE_MODEL
const runtimeRoot = path.join(root, 'native', `${process.platform}-${process.arch}`)
const info = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'runtime.json')))
const runtime = new NativeLlmRuntime({ serverPath: path.join(runtimeRoot, info.executable), modelPath,
  modelSha256, modelName: alternateModel ? 'Explicit alternate model smoke' : 'MiniCPM v2',
  gpuLayers: process.platform === 'darwin' && process.arch === 'arm64' ? 99 : 0,
  logPath: path.join(outputDir, 'native-electron.log'), timeoutMs: 60_000 })
const report = { at: new Date().toISOString(), platform: process.platform, arch: process.arch,
  modelSha256, alternateModel, scope: 'One synthetic formula plus cancellation; not an accuracy benchmark',
  startup: false, cancellation: false, error: null }
app.whenReady().then(async () => {
  let exitCode = 1
  try {
    const start = performance.now()
    assert.equal(await runtime.start(), true, runtime.status.error)
    report.startup = true
    report.startupMs = performance.now() - start
    report.backend = runtime.status.backend
    const issue = { sheetName: 'Demo', cellAddress: 'C2', ruleId: 'division_by_zero',
      formula: '=A2/B2', message: 'B2 is zero', confidence: 1, context: 'A2=100, B2=0.' }
    const requestStart = performance.now()
    report.response = await runtime.send({ method: 'analyze', params: { issues: [issue] } })
    report.requestMs = performance.now() - requestStart
    // A protocol rejection is recorded honestly, not converted into an accuracy success.
    const pending = runtime.send({ method: 'analyze', params: { issues: Array(12).fill(issue) } })
    await new Promise(resolve => setTimeout(resolve, 100))
    const cancelStart = performance.now()
    await runtime.shutdown()
    const cancelled = await pending
    assert.ok(cancelled.error, 'Cancelled inference must return a failure')
    assert.equal(runtime.status.modelLoaded, false)
    report.cancellation = true
    report.cancellationMs = performance.now() - cancelStart
    exitCode = 0
  } catch (error) {
    report.error = error.message
  } finally {
    await runtime.shutdown().catch(error => { report.error = error.message; exitCode = 1 })
    fs.writeFileSync(path.join(outputDir, 'native-electron-result.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report))
    app.exit(exitCode)
  }
})
