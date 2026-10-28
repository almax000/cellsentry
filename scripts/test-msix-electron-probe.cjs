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
