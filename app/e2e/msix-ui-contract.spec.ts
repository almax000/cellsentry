import { test, expect, type Locator } from '@playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'fs'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

const root = join(__dirname, '..')
const originalFixture = join(__dirname, 'fixtures', 'golden-three-workflows.xlsx')
const manifest = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'golden-three-workflows.manifest.json'), 'utf8'))

test('shared audit UI export contract uses visible source Electron controls, not MSIX evidence', async () => {
  const runRoot = join(root, 'tmp', 'store-source-freeze-20261029')
  mkdirSync(runRoot, { recursive: true })
  const outputDir = mkdtempSync(join(runRoot, 'msix-ui-contract-'))
  const inputDir = join(outputDir, 'input')
  mkdirSync(inputDir, { recursive: true })
  const fixture = join(inputDir, '客户 样例.xlsx')
  copyFileSync(originalFixture, fixture)

  let ctx: TestContext | undefined
  try {
    ctx = await launchApp()
    const { app, page } = ctx
    const consoleErrors: string[] = []
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
    const { runAuditUiContract } = require('../../scripts/probe-msix-electron-ui.cjs')
    const result = await runAuditUiContract({
      page,
      manifest,
      originalFixture,
      fixture,
      outputDir,
      dialogs: {
        open: async (mode: string, path: string, locator: Locator) => {
          await app.evaluate(({ dialog }, response) => { dialog.showOpenDialog = async () => response }, mode === 'CancelOpen' ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [path] })
          await locator.click()
        },
        save: async (mode: string, path: string, locator: Locator) => {
          await app.evaluate(({ dialog }, response) => { dialog.showSaveDialog = async () => response }, mode === 'CancelSave' ? { canceled: true } : { canceled: false, filePath: path })
          await locator.click()
        },
      },
    })
    expect(result.requiredFindingsVerified).toBe(manifest.audit.requiredIssues.length)
    expect(result.sourceUnchanged).toBe(true)
    expect(Object.keys(result.exports)).toEqual(['xlsx', 'html', 'pdf'])
    expect(ctx.rendererFailures).toEqual([])
    expect(consoleErrors).toEqual([])
  } finally {
    await teardownApp(ctx)
  }
})
