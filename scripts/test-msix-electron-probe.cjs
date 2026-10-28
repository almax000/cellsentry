const test = require('node:test')
const assert = require('node:assert/strict')
const { assertMainIdentity, isExpectedLoopbackWebSocket } = require('./probe-msix-electron.cjs')

test('requires the actual activation PID and Electron browser package signals together', () => {
  const observed = { pid: 3124, type: 'browser', windowsStore: true, isPackaged: true }
  assert.doesNotThrow(() => assertMainIdentity(observed, 3124))
  for (const incompatible of [
    { ...observed, pid: 3125 },
    { ...observed, type: 'renderer' },
    { ...observed, windowsStore: false },
    { ...observed, windowsStore: 'true' },
    { ...observed, isPackaged: false },
    { ...observed, isPackaged: 'true' },
    {}, null,
  ]) {
    assert.throws(() => assertMainIdentity(incompatible, 3124), /identity/)
  }
})

test('attaches only to the selected local debugging port without credentials or fragments', () => {
  assert.equal(isExpectedLoopbackWebSocket('ws://127.0.0.1:9229/inspector-id', 9229), true)
  for (const endpoint of [
    'ws://127.0.0.1:9230/inspector-id',
    'ws://localhost:9229/inspector-id',
    'ws://0.0.0.0:9229/inspector-id',
    'ws://[::1]:9229/inspector-id',
    'ws://192.168.1.1:9229/inspector-id',
    'ws://127.0.0.1.example.invalid:9229/inspector-id',
    'wss://127.0.0.1:9229/inspector-id',
    'ws://synthetic:synthetic@127.0.0.1:9229/inspector-id',
    'ws://127.0.0.1:9229/inspector-id#fragment',
    '', undefined,
  ]) {
    assert.equal(isExpectedLoopbackWebSocket(endpoint, 9229), false)
  }
})

test('scheduled quit still executes after the inspector evaluation has returned', { timeout: 10_000 }, async () => {
  const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
  const { spawn } = require('node:child_process')
  const { join } = require('node:path')
  const { inspectorEvaluate, QUIT_EXPRESSION } = require('./probe-msix-electron.cjs')
  const parent = join(__dirname, '..', 'tmp', 'msix-inspector-tests')
  await mkdir(parent, { recursive: true })
  const fixture = await mkdtemp(join(parent, 'quit-'))
  await mkdir(join(fixture, 'node_modules', 'electron'), { recursive: true })
  await writeFile(join(fixture, 'node_modules', 'electron', 'index.js'),
    'exports.app = { quit: () => process.exit(0) }\n')
  const target = join(fixture, 'target.cjs')
  await writeFile(target, "process.on('uncaughtException', error => process.stderr.write('async-error:' + error.message + '\\n')); setInterval(() => {}, 1000)\n")
  const child = spawn(process.execPath, ['--inspect=127.0.0.1:0', target], {
    cwd: fixture, stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  let endpointTimer, exitTimer
  try {
    const endpoint = await new Promise((resolve, reject) => {
      endpointTimer = setTimeout(() => reject(new Error('Inspector endpoint was not announced')), 5000)
      child.once('error', reject)
      child.stderr.on('data', data => {
        stderr += data.toString()
        const match = stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/)
        if (match) resolve(match[0])
      })
    })
    clearTimeout(endpointTimer)
    assert.equal(await inspectorEvaluate(endpoint, QUIT_EXPRESSION), 'quit-scheduled')
    const result = await Promise.race([
      exit,
      new Promise(resolve => { exitTimer = setTimeout(() => resolve({ timedOut: true }), 1500) }),
    ])
    assert.equal(result.timedOut, undefined,
      `Scheduled quit did not run; asynchronous require unavailable: ${stderr.includes('require is not defined')}`)
    assert.equal(result.code, 0)
  } finally {
    clearTimeout(endpointTimer)
    clearTimeout(exitTimer)
    if (child.exitCode === null && !child.killed) child.kill()
    await exit
    await rm(fixture, { recursive: true, force: true })
  }
})
