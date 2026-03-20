/**
 * Standalone screenshot capture script for the website.
 *
 * Unified scan flow: triggerFileAnalysis runs all 3 engines on one file.
 * Sidebar view-switching captures each engine's results separately.
 *
 * Run: cd app && npx tsx e2e/capture-screenshots.ts
 */
import { _electron as electron } from '@playwright/test'
import { join } from 'path'
import { startMockSidecar } from './mock-sidecar'

const WEBSITE_SCREENSHOTS = join(__dirname, '..', '..', 'website', 'public', 'screenshots')
const COMBINED_FIXTURE = join(__dirname, 'fixtures', 'combined-test-data.xlsx')

async function main() {
  console.log('Starting mock sidecar...')
  const mockSidecar = await startMockSidecar(0)

  console.log('Launching Electron app...')
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CELLSENTRY_TEST_MODE: '1',
      CELLSENTRY_FORCE_LOCALE: 'en'
    }
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Force renderer to English locale via i18next localStorage key
  await page.evaluate(() => localStorage.setItem('cellsentry-language', 'en'))
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(500)

  // 1. DropZone (home page = empty state)
  console.log('Capturing: DropZone...')
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-dropzone.png') })
  console.log('  -> app-dropzone.png')

  // 2. Unified scan — triggers all 3 engines
  console.log('Starting unified scan...')
  await page.evaluate((filePath) => {
    window.__TEST_API__?.triggerFileAnalysis(filePath)
  }, COMBINED_FIXTURE)

  // Wait for audit results (default view after scan)
  try {
    await page.waitForSelector('[data-testid="results-panel-left"]', { timeout: 15000 })
  } catch {
    await page.evaluate(() => { window.location.hash = '#/results' })
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(1000)

  // 3. Audit results (default active view)
  console.log('Capturing: Audit results...')
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-audit.png') })
  console.log('  -> app-audit.png')

  // 4. PII results — switch view via sidebar
  console.log('Capturing: PII results...')
  await page.locator('[data-testid="sidebar-nav-pii"]').click({ force: true })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-pii.png') })
  console.log('  -> app-pii.png')

  // 5. Extraction results — switch view via sidebar
  console.log('Capturing: Extraction results...')
  await page.locator('[data-testid="sidebar-nav-extraction"]').click({ force: true })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-extraction.png') })
  console.log('  -> app-extraction.png')

  console.log('Done! Closing app...')
  await app.close()
  await mockSidecar.close()
  console.log('All screenshots saved to website/public/screenshots/')
}

main().catch(err => {
  console.error('Screenshot capture failed:', err)
  process.exit(1)
})
