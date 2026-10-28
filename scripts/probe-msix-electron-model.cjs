// Model-mode companion to probe-msix-electron.cjs. It never enables test mode.
const { writeFileSync, readFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { resolve } = require('node:path')
const { inspectorEvaluate, isExpectedLoopbackWebSocket, QUIT_EXPRESSION } = require('./probe-msix-electron.cjs')
const [nodePort, cdpPort, expectedPid, receiptPath, screenshotPath, fixturePath, phase] = process.argv.slice(2)
const receipt = { success: false, nodeInspectorConnected: false, activationPidMatchedMainPid: false, processWindowsStoreTrue: false, electronPackagedTrue: false, rendererHomeVisible: false, realUpdaterChannelStore: false, modelLoaded: false, nativeBackend: false, bundledModelExists: false, firstRun: phase === 'first', reuseRun: phase === 'reuse', auditAttempted: false, auditReviewed: false }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const write = () => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
async function json(url, wait) { const end = Date.now() + wait; let last; while (Date.now() < end) { try { const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2000) }); if (!r.ok) throw Error(String(r.status)); return await r.json() } catch (e) { last = e; await sleep(200) } } throw Error(`timed out ${url}: ${last}`) }
async function main() {
  try {
    if (!nodePort || !cdpPort || !expectedPid || !fixturePath || !['first', 'reuse'].includes(phase)) throw Error('invalid model probe arguments')
    const targets = await json(`http://127.0.0.1:${nodePort}/json/list`, 20000)
    const target = targets.find(x => isExpectedLoopbackWebSocket(x.webSocketDebuggerUrl, Number(nodePort)))
    if (!target) throw Error('missing loopback Node inspector')
    receipt.nodeInspectorConnected = true
    const identity = JSON.parse(await inspectorEvaluate(target.webSocketDebuggerUrl, "JSON.stringify({pid:process.pid,type:process.type,windowsStore:process.windowsStore===true,isPackaged:require('electron').app.isPackaged===true,userData:require('electron').app.getPath('userData')})"))
    if (identity.pid !== Number(expectedPid) || identity.type !== 'browser' || !identity.windowsStore || !identity.isPackaged) throw Error('model activation identity mismatch')
    receipt.activationPidMatchedMainPid = identity.pid === Number(expectedPid); receipt.processWindowsStoreTrue = identity.windowsStore === true; receipt.electronPackagedTrue = identity.isPackaged === true
    receipt.mainIdentity = identity
    receipt.userData = identity.userData
    const fixtureHash = () => createHash('sha256').update(readFileSync(fixturePath)).digest('hex')
    receipt.fixtureBeforeSha256 = fixtureHash()
    if (receipt.fixtureBeforeSha256 !== '34578166728fc9ce4873ac5d1b15de4bbf9a651f167e41b1eec28e4d8152fd3d') throw Error('audit fixture did not match its independent manifest')
    const version = await json(`http://127.0.0.1:${cdpPort}/json/version`, 20000)
    if (!isExpectedLoopbackWebSocket(version.webSocketDebuggerUrl, Number(cdpPort))) throw Error('missing loopback CDP browser endpoint')
    const { chromium } = require(resolve(__dirname, '..', 'app', 'node_modules', 'playwright'))
    const browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl)
    try {
      const end = Date.now() + 30000; let page
      while (Date.now() < end && !page) { for (const c of browser.contexts()) for (const p of c.pages()) if (p.url().startsWith('file:') && await p.getByTestId('home-page').isVisible().catch(() => false)) { const urls = await inspectorEvaluate(target.webSocketDebuggerUrl, "require('electron').BrowserWindow.getAllWindows().map(w => w.webContents.getURL())"); if (Array.isArray(urls) && urls.includes(p.url())) { receipt.rendererUrl = p.url(); receipt.rendererWindowUrls = urls; page = p; break } } if (!page) await sleep(200) }
      if (!page) throw Error('model probe home page unavailable')
      receipt.rendererHomeVisible = true
      if (await page.evaluate(() => typeof window.__TEST_API__ !== 'undefined')) throw Error('model probe must use production IPC without test mode')
      receipt.updateChannel = await page.evaluate(() => window.api.getUpdateChannel())
      receipt.realUpdaterChannelStore = receipt.updateChannel === 'store'
      if (!receipt.realUpdaterChannelStore) throw Error(`unexpected update channel: ${receipt.updateChannel}`)
      const modelEnd = Date.now() + 240000; let status
      while (Date.now() < modelEnd) { status = await page.evaluate(() => Promise.all([window.api.getModelStatus(), window.api.getLlmStatus()])); if (status[0].exists && status[0].loaded && status[0].available && status[0].backend === 'llama.cpp' && status[0].setup?.phase === 'ready' && status[1].modelLoaded) break; await sleep(500) }
      receipt.modelStatus = status?.[0]; receipt.llmStatus = status?.[1]
      receipt.bundledModelExists = status?.[0]?.exists === true; receipt.modelLoaded = status?.[0]?.loaded === true && status?.[1]?.modelLoaded === true; receipt.nativeBackend = status?.[0]?.available === true && status?.[0]?.backend === 'llama.cpp'
      if (!receipt.bundledModelExists || !receipt.modelLoaded || !receipt.nativeBackend || status?.[0]?.setup?.phase !== 'ready') throw Error('bundled model was not prepared and loaded')
      if (phase === 'first') {
        const audit = await page.evaluate(async ({ fixture, scanId }) => new Promise(async (resolve, reject) => {
          const timer = setTimeout(() => { off(); reject(new Error('audit engine event timed out')) }, 70000)
          const off = window.api.onEngineDone(event => { if (event.scanId === scanId && event.engine === 'audit') { clearTimeout(timer); off(); resolve(event) } })
          const start = await window.api.analyzeAll(fixture, scanId); if (!start.success) { clearTimeout(timer); off(); reject(new Error(start.error || 'analysis rejected')) }
        }), { fixture: fixturePath, scanId: `msix-model-${Date.now()}` })
        if (audit.error || !audit.result?.auditReview) throw Error(audit.error || 'audit did not report local AI review')
        const review = audit.result.auditReview; receipt.auditReview = review; receipt.auditAttempted = Number.isInteger(review.attempted) && review.attempted > 0; receipt.auditReviewed = Number.isInteger(review.reviewed) && review.reviewed > 0
        if (!['total', 'selected', 'attempted', 'reviewed', 'failed', 'skipped'].every(k => Number.isInteger(review[k]) && review[k] >= 0) || !receipt.auditAttempted || !receipt.auditReviewed || review.attempted > review.selected || review.reviewed > review.attempted || review.reviewed + review.failed !== review.attempted || review.selected > review.total || review.skipped !== review.total - review.attempted || !['complete', 'candidate-limit'].includes(review.stopReason)) throw Error('audit review counters did not prove a valid local-model review')
      }
      receipt.fixtureAfterSha256 = fixtureHash()
      if (receipt.fixtureAfterSha256 !== receipt.fixtureBeforeSha256) throw Error('audit modified the source fixture')
      await page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 10000 })
      receipt.screenshot = screenshotPath
    } finally { await browser.close() }
    await inspectorEvaluate(target.webSocketDebuggerUrl, QUIT_EXPRESSION)
    receipt.success = true
  } catch (error) { receipt.error = error instanceof Error ? error.message : String(error) } finally { write() }
  if (!receipt.success) process.exitCode = 1
}
if (require.main === module) main().catch(error => { receipt.error = String(error); write(); process.exitCode = 1 })
