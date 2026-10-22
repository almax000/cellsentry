/**
 * Standalone screenshot capture script for the website.
 *
 * Unified scan flow: triggerFileAnalysis runs all 3 engines on one file.
 * Sidebar view-switching captures each engine's results separately.
 *
 * Run: cd app && npx tsx e2e/capture-screenshots.ts
 */
import { mkdirSync } from 'fs'
import { join } from 'path'
import { launchApp, teardownApp } from './electron.setup'

const WEBSITE_SCREENSHOTS = join(__dirname, '..', 'tmp', 'e2e', 'screenshots')
const COMBINED_FIXTURE = join(__dirname, 'fixtures', 'combined-test-data.xlsx')

async function main() {
  mkdirSync(WEBSITE_SCREENSHOTS, { recursive: true })
  console.log('Launching Electron app...')
  const ctx = await launchApp()
  const { page } = ctx

  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(500)

  // 1. Settings confirms no model has been downloaded in test mode.
  await page.locator('[data-testid="sidebar-nav-settings"]').click()
  await page.screenshot({ animations: 'disabled', path: join(WEBSITE_SCREENSHOTS, 'settings-no-model-1200x800.png') })
  await page.setViewportSize({ width: 800, height: 600 })
  await page.screenshot({ animations: 'disabled', path: join(WEBSITE_SCREENSHOTS, 'settings-no-model-800x600.png') })
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.locator('[data-testid="sidebar-nav-home"]').click()

  // 2. Unified scan — triggers all 3 engines
  console.log('Starting unified scan...')
  await page.evaluate((filePath) => {
    window.__TEST_API__?.triggerFileAnalysis(filePath)
  }, COMBINED_FIXTURE)

  // Wait for audit results (default view after scan)
  await page.waitForSelector('[data-testid="results-panel-left"]', { timeout: 30000 })

  // 3. Audit results (default active view)
  console.log('Capturing: Audit results...')
  await page.screenshot({ animations: 'disabled', path: join(WEBSITE_SCREENSHOTS, 'app-audit.png') })
  console.log('  -> app-audit.png')

  // 4. PII results — switch view via sidebar
  console.log('Capturing: PII results...')
  await page.locator('[data-testid="sidebar-nav-pii"]').click()
  await page.waitForTimeout(1000)
  await page.screenshot({ animations: 'disabled', path: join(WEBSITE_SCREENSHOTS, 'app-pii.png') })
  console.log('  -> app-pii.png')

  // 5. Extraction results — switch view via sidebar
  console.log('Capturing: Extraction results...')
  await page.locator('[data-testid="sidebar-nav-extraction"]').click()
  await page.waitForTimeout(1000)
  await page.screenshot({ animations: 'disabled', path: join(WEBSITE_SCREENSHOTS, 'app-extraction.png') })
  console.log('  -> app-extraction.png')

  console.log('Done! Closing app...')
  await teardownApp(ctx)
  console.log('All screenshots saved to app/tmp/e2e/screenshots/')
}

main().catch(err => {
  console.error('Screenshot capture failed:', err)
  process.exit(1)
})
