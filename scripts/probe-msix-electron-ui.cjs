// Installed production UI, real Windows file dialogs, synthetic inputs only.
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { resolve, join } = require('node:path')
const { execFile } = require('node:child_process')
const { inspectorEvaluate, assertMainIdentity, isExpectedLoopbackWebSocket, QUIT_EXPRESSION, waitForJson, withinTimeout } = require('./probe-msix-electron.cjs')
const [nodePort, cdpPort, expectedPid, receiptPath, screenshotPath, originalFixture, outputDir] = process.argv.slice(2)
const root = resolve(__dirname, '..')
const receipt = { success: false, nodeInspectorConnected: false, activationPidMatchedMainPid: false, processWindowsStoreTrue: false, electronPackagedTrue: false, rendererHomeVisible: false, realUpdaterChannelStore: false, nativeDialogs: [], modelInferenceVerified: false, windows11Verified: false, storeAcquisitionVerified: false, globalNetworkVerified: false }
const write = () => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2))
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function nativeDialog(mode, path) {
  const nativeReceiptPath = join(outputDir, `native-${receipt.nativeDialogs.length}-${mode}-receipt.json`)
  const args = ['-NoProfile', '-NonInteractive', '-STA', '-File', join(__dirname, 'operate-msix-file-dialog.ps1'), '-ActivatedProcessId', expectedPid, '-Mode', mode, '-FilePath', path, '-ReceiptPath', nativeReceiptPath, '-TimeoutSeconds', '20']
  return new Promise((resolvePromise, reject) => {
    // execFile preserves environment/proxy configuration and quotes Unicode paths.
    execFile('powershell.exe', args, { timeout: 45000, windowsHide: true, maxBuffer: 128 * 1024 }, error => {
      let native
      try { native = JSON.parse(readFileSync(nativeReceiptPath, 'utf8').replace(/^\uFEFF/, '')) } catch (readError) { return reject(new Error(`Native ${mode} receipt missing: ${readError.message}`)) }
      receipt.nativeDialogs.push(native); write()
      if (error || native.success !== true || native.dialog?.processId !== Number(expectedPid) || native.dialogClosed !== true) return reject(new Error(`Native ${mode} failed: ${native.error || error?.message || 'identity/close mismatch'}`))
      resolvePromise(native)
    })
  })
}
async function clickWithNative(page, mode, path, locator) {
  // The native helper waits before clicking, so a modal does not deadlock CDP.
  const native = nativeDialog(mode, path)
  await Promise.all([native, locator.click({ timeout: 30000 })])
}
async function main() {
  let browser
  try {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw Error('Installed UI probe is limited to an ephemeral Windows runner')
    assert(nodePort && cdpPort && expectedPid && originalFixture && outputDir)
    const manifest = JSON.parse(readFileSync(join(root, 'app/e2e/fixtures/golden-three-workflows.manifest.json'), 'utf8'))
    assert.equal(sha(originalFixture), manifest.sourceSha256)
    mkdirSync(join(outputDir, 'input'), { recursive: true })
    const fixture = join(outputDir, 'input', '客户 样例.xlsx')
    copyFileSync(originalFixture, fixture)
    receipt.sourceBeforeSha256 = sha(fixture)
    const target = (await waitForJson(`http://127.0.0.1:${nodePort}/json/list`, 20000)).find(x => isExpectedLoopbackWebSocket(x.webSocketDebuggerUrl, Number(nodePort)))
    assert(target, 'Expected loopback main inspector')
    const identity = await inspectorEvaluate(target.webSocketDebuggerUrl, "({pid:process.pid,type:process.type,windowsStore:process.windowsStore===true,isPackaged:require('electron').app.isPackaged===true})")
    assertMainIdentity(identity, Number(expectedPid)); receipt.mainIdentity = identity
    receipt.nodeInspectorConnected = receipt.activationPidMatchedMainPid = receipt.processWindowsStoreTrue = receipt.electronPackagedTrue = true
    const version = await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`, 20000)
    assert(isExpectedLoopbackWebSocket(version.webSocketDebuggerUrl, Number(cdpPort)))
    const { chromium } = require(join(root, 'app/node_modules/playwright'))
    browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl)
    let page
    const deadline = Date.now() + 20000
    while (!page && Date.now() < deadline) {
      const urls = await inspectorEvaluate(target.webSocketDebuggerUrl, "require('electron').BrowserWindow.getAllWindows().map(w=>w.webContents.getURL())")
      for (const context of browser.contexts()) for (const candidate of context.pages()) if (urls.includes(candidate.url()) && candidate.url().startsWith('file:') && await candidate.getByTestId('home-page').isVisible()) page = candidate
      if (!page) await new Promise(resolvePromise => setTimeout(resolvePromise, 150))
    }
    assert(page, 'Real main-window home must be visible')
    receipt.rendererHomeVisible = true; receipt.rendererUrl = page.url()
    assert.equal(await page.evaluate(() => typeof window.__TEST_API__), 'undefined')
    receipt.realUpdaterChannelStore = await page.evaluate(() => window.api.getUpdateChannel()) === 'store'
    assert(receipt.realUpdaterChannelStore)
    const model = await page.evaluate(() => window.api.getModelStatus())
    assert.equal(model.exists, false, 'UI-only mode must prove the no-model rules path')
    receipt.rulesOnly = true
    const pageErrors = []; const consoleErrors = []; const requestFailures = [];
    page.on('pageerror', error => pageErrors.push(error.message)); page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) });
    page.on('requestfailed', request => requestFailures.push({ protocol: new URL(request.url()).protocol, error: request.failure()?.errorText }))
    await page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 10000 }); receipt.screenshot = screenshotPath
    await page.getByTestId('home-task-audit').click()
    await page.getByTestId('entry-audit').waitFor({ state: 'visible', timeout: 10000 })
    await clickWithNative(page, 'CancelOpen', fixture, page.getByTestId('dropzone-browse-btn'))
    assert(await page.getByTestId('entry-audit').isVisible(), 'Cancelled selection must keep the import page')
    receipt.nativeOpenCancelled = true
    await clickWithNative(page, 'Open', fixture, page.getByTestId('dropzone-browse-btn'))
    await page.waitForURL(/#\/results$/, { timeout: 30000 })
    await page.getByTestId('results-panel-left').waitFor({ state: 'visible' })
    receipt.nativeOpenSelected = true
    for (const issue of manifest.audit.requiredIssues) {
      const card = page.locator(`[data-testid^="results-issue-card-"][data-rule-id=${JSON.stringify(issue.ruleId)}][data-sheet-name=${JSON.stringify(issue.sheet)}][data-cell-address=${JSON.stringify(issue.cell)}]`)
      await card.waitFor({ state: 'visible', timeout: 30000 }); assert.equal(await card.count(), 1, `Required independent finding missing: ${issue.ruleId}/${issue.cell}`)
    }
    receipt.requiredFindingsVerified = manifest.audit.requiredIssues.length
    const first = manifest.audit.requiredIssues[0]
    await page.locator(`[data-testid^="results-issue-card-"][data-rule-id=${JSON.stringify(first.ruleId)}][data-cell-address=${JSON.stringify(first.cell)}]`).click()
    await page.locator('.ss-cell.selected-cell').first().waitFor({ state: 'visible', timeout: 10000 })
    receipt.cellDetailSelected = true
    await page.screenshot({ path: join(outputDir, 'ui-results.png'), animations: 'disabled', timeout: 10000 })
    const cancelled = join(outputDir, '取消报告.html')
    await page.getByTestId('export-btn').click()
    await clickWithNative(page, 'CancelSave', cancelled, page.getByTestId('export-html'))
    assert(!existsSync(cancelled)); assert.equal(await page.locator('.export-feedback.success').count(), 0)
    receipt.nativeSaveCancelled = true
    const outputs = {}
    for (const format of ['xlsx', 'html', 'pdf']) {
      const path = join(outputDir, `审计 结果.${format}`)
      assert(!existsSync(path))
      await page.getByTestId('export-btn').click()
      await clickWithNative(page, 'Save', path, page.getByTestId(`export-${format}`))
      await page.locator('.export-feedback.success').waitFor({ state: 'visible', timeout: 30000 })
      assert((await page.locator('.export-feedback.success').textContent()).includes(path))
      const bytes = readFileSync(path); assert(bytes.length > 0)
      outputs[format] = { bytes: bytes.length, sha256: sha(path) }
      if (format === 'pdf') { assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert(bytes.subarray(-1024).toString().includes('%%EOF')); receipt.pdfHeaderAndTrailerVerified = true }
      if (format === 'html') for (const issue of manifest.audit.requiredIssues) assert(bytes.toString('utf8').includes(issue.cell))
      if (format === 'xlsx') {
        const ExcelJS = require(join(root, 'app/node_modules/exceljs')); const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(path)
        for (const issue of manifest.audit.requiredIssues) assert(JSON.stringify(workbook.getWorksheet(issue.sheet).getCell(issue.cell).note).includes('[CellSentry]'))
      }
    }
    receipt.exports = outputs; receipt.markedWorkbookVerified = receipt.htmlReportVerified = receipt.pdfReportVerified = true
    receipt.sourceAfterSha256 = sha(fixture); assert.equal(receipt.sourceAfterSha256, receipt.sourceBeforeSha256); assert.equal(sha(originalFixture), manifest.sourceSha256)
    receipt.sourceUnchanged = true; receipt.rendererErrors = pageErrors; receipt.consoleErrors = consoleErrors; receipt.requestFailures = requestFailures;
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(requestFailures, [])
    await page.screenshot({ path: join(outputDir, 'ui-export.png'), animations: 'disabled', timeout: 10000 })
    await withinTimeout(browser.close(), 5000, 'CDP close'); browser = undefined
    await inspectorEvaluate(target.webSocketDebuggerUrl, QUIT_EXPRESSION)
    receipt.normalExitRequested = true; receipt.success = true
  } catch (error) { receipt.error = error.message } finally {
    if (browser) await withinTimeout(browser.close(), 5000, 'CDP close after failure').catch(() => {})
    write()
  }
  if (!receipt.success) process.exitCode = 1
}
main().catch(error => { receipt.error = error.message; write(); process.exitCode = 1 })
