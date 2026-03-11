/**
 * Standalone screenshot capture script for the website.
 * Run: cd app && npx tsx e2e/capture-screenshots.ts
 */
import { _electron as electron } from '@playwright/test'
import { join } from 'path'
import { startMockSidecar } from './mock-sidecar'

const WEBSITE_SCREENSHOTS = join(__dirname, '..', '..', 'website', 'public', 'screenshots')
const AUDIT_FIXTURE = join(__dirname, '..', '..', 'data', 'corpus', 'en', 'mixed_errors.xlsx')
const PII_FIXTURE = join(__dirname, 'fixtures', 'pii-test-data.xlsx')
const EXTRACTION_FIXTURE = join(__dirname, 'fixtures', 'invoice-test-data.xlsx')

async function main() {
  console.log('Starting mock sidecar...')
  const mockSidecar = await startMockSidecar(0)

  console.log('Launching Electron app...')
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CELLSENTRY_TEST_MODE: '1'
    }
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  // Set a good viewport size
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(500)

  // 1. DropZone (empty state)
  console.log('Capturing: DropZone...')
  await page.locator('[data-testid="sidebar-nav-audit"]').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-dropzone.png') })
  console.log('  -> app-dropzone.png')

  // 2. Audit results
  console.log('Capturing: Audit results...')
  await page.locator('[data-testid="sidebar-nav-audit"]').click()
  await page.waitForTimeout(300)
  await page.evaluate((filePath) => {
    window.__TEST_API__?.triggerFileAnalysis(filePath)
    window.location.hash = '#/scanning'
  }, AUDIT_FIXTURE)
  // Wait for results to auto-navigate (same pattern as PII/extraction)
  try {
    await page.waitForSelector('[data-testid="results-panel-left"]', { timeout: 15000 })
  } catch {
    // fallback — navigate manually if auto-nav didn't happen
    await page.evaluate(() => { window.location.hash = '#/results' })
  }
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-audit.png') })
  console.log('  -> app-audit.png')

  // 3. PII results
  console.log('Capturing: PII results...')
  await page.locator('[data-testid="sidebar-nav-pii"]').click()
  await page.waitForTimeout(500)
  await page.evaluate((filePath) => {
    window.__TEST_API__?.triggerPiiScan(filePath)
    window.location.hash = '#/pii/scanning'
  }, PII_FIXTURE)
  // Wait for results to auto-navigate
  try {
    await page.waitForSelector('[data-testid="pii-results-panel-left"]', { timeout: 15000 })
  } catch {
    // fallback
  }
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(WEBSITE_SCREENSHOTS, 'app-pii.png') })
  console.log('  -> app-pii.png')

  // 4. Extraction results
  console.log('Capturing: Extraction results...')
  await page.locator('[data-testid="sidebar-nav-extraction"]').click()
  await page.waitForTimeout(500)
  await page.evaluate((filePath) => {
    window.__TEST_API__?.triggerExtractionScan(filePath)
    window.location.hash = '#/extract/scanning'
  }, EXTRACTION_FIXTURE)
  try {
    await page.waitForSelector('[data-testid="extraction-results"]', { timeout: 15000 })
  } catch {
    // fallback
  }
  await page.waitForTimeout(2000)
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
