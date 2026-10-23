const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const appNodeModules = process.env.CELLSENTRY_NODE_MODULES || path.join(root, 'app/node_modules')
const esbuild = require(path.join(appNodeModules, 'esbuild'))
fs.mkdirSync(path.join(root, '.runtime/tests'), { recursive: true })
function bundled(name) {
  const outfile = path.join(root, `.runtime/tests/${name}.cjs`)
  esbuild.buildSync({ entryPoints: [path.join(root, `app/electron/llm/${name}.ts`)],
    outfile, bundle: true, platform: 'node', format: 'cjs' })
  return require(outfile)
}
const { parseAudit, parsePii, parseExtraction } = bundled('protocol')
const { buildAuditPrompt } = bundled('prompts')
const { NativeLlmRuntime } = bundled('native')
const { mergeJudgments } = bundled('reconcile')
const importerOutput = path.join(root, '.runtime/tests/importer.cjs')
esbuild.buildSync({ entryPoints: [path.join(root, 'app/electron/model/importer.ts')],
  outfile: importerOutput, bundle: true, platform: 'node', format: 'cjs' })
const { importModelFile } = require(importerOutput)
const samples = JSON.parse(fs.readFileSync(path.join(root, 'ios/CellSentryPhone/Resources/samples.json')))
const issue = samples[0].issue
const judgment = { sheetName: issue.sheetName, cellAddress: issue.cellAddress, ruleId: issue.ruleId,
  isValid: true, adjustedConfidence: 0.95, reasoning: 'Zero denominator' }

test('mobile resources preserve desktop prompts and input identity', () => {
  for (const sample of samples) assert.equal(buildAuditPrompt([sample.issue]), sample.expectedPrompt)
  assert.deepEqual(parseAudit(JSON.stringify([judgment]), issue), [judgment])
})
test('wrong identity, nonboolean decisions, invalid confidences and markdown cannot change findings', () => {
  for (const change of [{ cellAddress: 'WRONG' }, { ruleId: 'WRONG' },
    { isValid: 'false' }, { adjustedConfidence: 1.1 }, { reasoning: '' }]) {
    assert.throws(() => parseAudit(JSON.stringify([{ ...judgment, ...change }]), issue))
  }
  assert.throws(() => parseAudit('```json\n[]\n```', issue))
})
test('reconciliation keeps deterministic findings and scopes identical cells by sheet', () => {
  const issues = [
    { sheet: 'January', ruleId: 'formula', cellAddress: 'A1', confidence: 0.9 },
    { sheet: 'February', ruleId: 'formula', cellAddress: 'A1', confidence: 0.9 },
  ]
  const merged = mergeJudgments(issues, [
    { ...judgment, sheetName: 'January', ruleId: 'formula', cellAddress: 'A1', isValid: false, adjustedConfidence: 0.1 },
    // A duplicate cannot replace the first validated judgment during retries.
    { ...judgment, sheetName: 'January', ruleId: 'formula', cellAddress: 'A1', isValid: true, adjustedConfidence: 0.99 },
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged[0].llmVerified, false)
  assert.equal(merged[0].llmDisputed, true)
  assert.equal(merged[0].llmConfidence, 0.1)
  assert.equal(merged[1].llmVerified, undefined)
})
test('native transport uses Electron proxy-aware net and never node:http direct requests', () => {
  const nativeSource = fs.readFileSync(path.join(root, 'app/electron/llm/native.ts'), 'utf8')
  assert.match(nativeSource, /await import\('electron'\)/)
  assert.match(nativeSource, /net\.request/)
  assert.doesNotMatch(nativeSource, /await import\('http'\)/)
  assert.doesNotMatch(nativeSource, /NO_PROXY/)
})
test('PII and extraction reject hallucinated cell addresses', () => {
  assert.throws(() => parsePii(JSON.stringify([{ cellAddress: 'WRONG', piiType: 'email',
    confidence: 0.9, reasoning: 'x' }]), new Set(['A1'])))
  assert.throws(() => parseExtraction(JSON.stringify({ documentType: 'invoice', fields: [
    { key: 'date', label: 'Date', value: '2026-01-01', cellAddress: 'WRONG', confidence: 0.9 }]}), new Set(['A1'])))
})
test('missing native assets fail without spawning Python or leaking a process', async () => {
  const runtime = new NativeLlmRuntime({ serverPath: path.join(root, '.runtime/does-not-exist'),
    modelPath: 'missing.gguf', modelSha256: '', modelName: 'missing' })
  assert.equal(await runtime.start(), false)
  assert.equal(runtime.status.available, false)
  await runtime.shutdown()
})
test('queued requests are invalidated on shutdown', async () => {
  const runtime = new NativeLlmRuntime({ serverPath: 'missing', modelPath: 'missing', modelSha256: '', modelName: 'missing' })
  const pending = runtime.send({ method: 'analyze', params: { issues: [issue] } })
  await runtime.shutdown()
  assert.match((await pending).error, /cancelled/)
  // Cancellation only invalidates the old epoch. A later request can attempt a
  // new start and therefore reports missing assets, rather than staying stuck
  // behind the cancelled queue forever.
  const later = await runtime.send({ method: 'analyze', params: { issues: [issue] } })
  assert.match(later.error, /unavailable/)
  await Promise.all([runtime.shutdown(), runtime.shutdown()])
})

test('offline import validates the staged copy and preserves an existing model on failure', async () => {
  const dir = fs.mkdtempSync(path.join(root, '.runtime/tests/import-'))
  const source = path.join(dir, 'source.gguf'), destination = path.join(dir, 'model.gguf')
  const bytes = Buffer.from('GGUF fixture')
  fs.writeFileSync(source, bytes); fs.writeFileSync(destination, 'existing model')
  try {
    await assert.rejects(importModelFile(source, destination, bytes.length, 'wrong'), /SHA256/)
    assert.equal(fs.readFileSync(destination, 'utf8'), 'existing model')
    const hash = require('node:crypto').createHash('sha256').update(bytes).digest('hex')
    await importModelFile(source, destination, bytes.length, hash)
    assert.deepEqual(fs.readFileSync(destination), bytes)
    assert.equal(fs.readdirSync(dir).filter(f => f.endsWith('.importing')).length, 0)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('real GGUF native startup and cancellation through Electron net', {
  skip: process.env.CELLSENTRY_NATIVE_SMOKE !== '1', timeout: 240_000,
}, async () => {
  const { promisify } = require('node:util')
  const execFile = promisify(require('node:child_process').execFile)
  const electronPackage = path.join(appNodeModules, 'electron')
  let electron
  try {
    electron = require(electronPackage)
  } catch (error) {
    // Some offline Electron archives contain the complete platform binary but
    // omit electron/path.txt. Use that already-installed binary for this
    // opt-in smoke; do not reinstall or fetch Electron during verification.
    const executable = process.platform === 'darwin'
      ? path.join(electronPackage, 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
      : path.join(electronPackage, 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
    if (!fs.existsSync(executable)) throw error
    electron = executable
  }
  const result = await execFile(electron, [path.join(root, 'scripts/smoke-native-electron.cjs')],
    { timeout: 230_000, maxBuffer: 1_000_000 })
  assert.ok(result.stdout.includes('"startup":true'))
})
