import { test, expect } from '@playwright/test'
import { join } from 'path'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

const FIXTURE = join(__dirname, 'fixtures', 'combined-test-data.xlsx')

let ctx: TestContext
const gatePath = join(__dirname, '..', 'tmp', 'e2e', 'cancellation', 'release-read')

test.beforeAll(async () => {
  mkdirSync(join(__dirname, '..', 'tmp', 'e2e', 'cancellation'), { recursive: true })
  if (existsSync(gatePath)) unlinkSync(gatePath)
  ctx = await launchApp({ xlsxGatePath: gatePath })
})
test.afterAll(async () => { if (ctx) await teardownApp(ctx) })

test('cancels a real IPC scan and permits a later rescan', async () => {
  // getFileInfo is the first real read; the test-only process gate delays
  // the second read, which remains the real ExcelJS parser in main-process IPC.

  await ctx.page.evaluate(async (filePath) => { await window.__TEST_API__?.triggerFileAnalysis(filePath) }, FIXTURE)
  await expect(ctx.page.locator('[data-testid="scanning-phase"]')).toBeVisible()

  const cancel = ctx.page.locator('[data-testid="scan-cancel"]')
  await cancel.click({ position: { x: 8, y: 8 } })
  await expect(cancel).toBeDisabled()
  await expect(cancel).toHaveText(/cancelling/i)
  await expect(ctx.page.locator('[data-testid="scanning-phase"]')).toBeVisible()

  writeFileSync(gatePath, 'release\n')

  await expect(ctx.page.locator('[data-testid="home-page"]')).toBeVisible({ timeout: 15_000 })
  await expect(ctx.page.locator('[data-testid="scanning-phase"]')).toHaveCount(0)

  // The next scan goes through the same real renderer trigger and IPC path.
  await ctx.page.evaluate(async (filePath) => { await window.__TEST_API__?.triggerFileAnalysis(filePath) }, FIXTURE)
  await expect(ctx.page).toHaveURL(/#\/results$/, { timeout: 30_000 })
  await expect(ctx.page.locator('[data-testid="results-panel-left"]')).toBeVisible()
})
