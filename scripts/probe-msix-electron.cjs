const { writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const [nodePort, cdpPort, expectedPid, receiptPath, screenshotPath] = process.argv.slice(2)

const receipt = {
  success: false,
  nodeInspectorConnected: false,
  activationPidMatchedMainPid: false,
  processWindowsStoreTrue: false,
  electronPackagedTrue: false,
  rendererHomeVisible: false,
  realUpdaterChannelStore: false,
  normalExitRequested: false,
  nodePort: Number(nodePort),
  cdpPort: Number(cdpPort),
  expectedPid: Number(expectedPid),
}

function writeReceipt() {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2_000) })
      if (!response.ok) throw new Error(`${url} returned ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      await sleep(150)
    }
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function withinTimeout(operation, timeoutMs, label) {
  let timeout
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}

function isExpectedLoopbackWebSocket(value, port) {
  try {
    const endpoint = new URL(value)
    return endpoint.protocol === 'ws:' &&
      endpoint.hostname === '127.0.0.1' &&
      endpoint.port === String(port) &&
      endpoint.username === '' &&
      endpoint.password === '' &&
      endpoint.hash === ''
  } catch {
    return false
  }
}

function assertMainIdentity(value, expectedProcessId) {
  if (!value || value.pid !== expectedProcessId || value.type !== 'browser' || value.windowsStore !== true || value.isPackaged !== true) {
    throw new Error('Activated Electron main-process identity did not match the required MSIX signals')
  }
}

async function inspectorEvaluate(wsUrl, expression) {
  return await new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('Node inspector evaluation timed out after 10000ms'))
    }, 10_000)
    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Node inspector WebSocket failed'))
    }, { once: true })
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression,
          returnByValue: true,
          awaitPromise: true,
          // Electron 28+ needs this for require('electron') in the inspector.
          includeCommandLineAPI: true,
        },
      }))
    }, { once: true })
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id !== 1) return
      clearTimeout(timeout)
      socket.close()
      if (message.error || message.result?.exceptionDetails) {
        reject(new Error(`Node inspector evaluation failed: ${JSON.stringify(message.error ?? message.result.exceptionDetails)}`))
        return
      }
      resolvePromise(message.result?.result?.value)
    })
  })
}

async function main() {
  try {
    if (!nodePort || !cdpPort || !expectedPid || !receiptPath || !screenshotPath) {
      throw new Error('Expected node port, CDP port, activation PID, receipt path, and screenshot path')
    }
    const nodeTargets = await waitForJson(`http://127.0.0.1:${nodePort}/json/list`, 20_000)
    const nodeTarget = nodeTargets.find(target => isExpectedLoopbackWebSocket(target.webSocketDebuggerUrl, nodePort))
    if (!nodeTarget) throw new Error('Node inspector did not expose the expected loopback WebSocket target')
    receipt.nodeInspectorConnected = true

    const mainIdentity = await inspectorEvaluate(
      nodeTarget.webSocketDebuggerUrl,
      "JSON.stringify({ pid: process.pid, type: process.type, windowsStore: process.windowsStore === true, isPackaged: require('electron').app.isPackaged === true, argv: process.argv, windowUrls: require('electron').BrowserWindow.getAllWindows().map(window => window.webContents.getURL()) })"
    )
    receipt.mainIdentity = JSON.parse(mainIdentity)
    receipt.activationPidMatchedMainPid = receipt.mainIdentity.pid === receipt.expectedPid
    receipt.processWindowsStoreTrue = receipt.mainIdentity.windowsStore === true
    receipt.electronPackagedTrue = receipt.mainIdentity.isPackaged === true
    assertMainIdentity(receipt.mainIdentity, receipt.expectedPid)

    const { chromium } = require(resolve(__dirname, '..', 'app', 'node_modules', 'playwright'))
    const cdpVersion = await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`, 20_000)
    if (!isExpectedLoopbackWebSocket(cdpVersion.webSocketDebuggerUrl, cdpPort)) {
      throw new Error('Chromium remote debugging did not expose the expected browser loopback WebSocket endpoint')
    }
    const browser = await withinTimeout(chromium.connectOverCDP(cdpVersion.webSocketDebuggerUrl), 10_000, 'CDP connection')
    try {
      const deadline = Date.now() + 20_000
      let page
      while (Date.now() < deadline && !page) {
        for (const context of browser.contexts()) {
          for (const candidate of context.pages()) {
            if (candidate.url().startsWith('file:') && await candidate.getByTestId('home-page').isVisible().catch(() => false)) {
              // Loading can finish after the first identity query. Bind the
              // rendered page to the main process's current window URLs.
              const rendererUrls = await inspectorEvaluate(nodeTarget.webSocketDebuggerUrl,
                "require('electron').BrowserWindow.getAllWindows().map(window => window.webContents.getURL())")
              if (Array.isArray(rendererUrls) && rendererUrls.includes(candidate.url())) {
                receipt.rendererUrl = candidate.url()
                receipt.rendererWindowUrls = rendererUrls
                page = candidate
                break
              }
            }
          }
          if (page) break
        }
        if (!page) await sleep(150)
      }
      if (!page) throw new Error('Renderer home page was not visible within 20000ms')
      receipt.rendererHomeVisible = true
      await withinTimeout(page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 10_000 }), 10_000, 'Renderer screenshot')
      receipt.screenshot = screenshotPath
      receipt.updateChannel = await withinTimeout(page.evaluate(() => window.api.getUpdateChannel()), 10_000, 'Update-channel IPC')
      receipt.realUpdaterChannelStore = receipt.updateChannel === 'store'
      if (!receipt.realUpdaterChannelStore) throw new Error(`Expected Store update channel, received ${receipt.updateChannel}`)
    } finally {
      await withinTimeout(browser.close(), 5_000, 'CDP close')
    }

    await inspectorEvaluate(nodeTarget.webSocketDebuggerUrl, "setTimeout(() => require('electron').app.quit(), 100); 'quit-scheduled'")
    receipt.normalExitRequested = true
    receipt.success = true
  } catch (error) {
    receipt.error = error instanceof Error ? error.message : String(error)
  } finally {
    writeReceipt()
  }
  if (!receipt.success) process.exitCode = 1
}

module.exports = { assertMainIdentity, isExpectedLoopbackWebSocket }

if (require.main === module) {
  main().catch(error => {
    receipt.error = error instanceof Error ? error.message : String(error)
    writeReceipt()
    process.exitCode = 1
  })
}
