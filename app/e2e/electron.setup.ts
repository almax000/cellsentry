import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'path'
import { startMockSidecar, type MockSidecar } from './mock-sidecar'

export interface TestContext {
  app: ElectronApplication
  page: Page
  mockSidecar: MockSidecar
}

/**
 * Launch the Electron app for testing.
 *
 * 1. Starts a mock HTTP server (kept for visual test data compatibility)
 * 2. Passes CELLSENTRY_TEST_MODE=1 to Electron
 * 3. Waits for the app to render
 *
 * Note: The app no longer calls the mock sidecar over HTTP — all IPC
 * handlers now use the TypeScript engine directly. The mock sidecar is
 * retained for potential visual test data injection in the future.
 */
export async function launchApp(): Promise<TestContext> {
  const mockSidecar = await startMockSidecar(0)

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
  // Give React time to render
  await page.waitForTimeout(1000)

  return { app, page, mockSidecar }
}

/**
 * Gracefully tear down the test context.
 */
export async function teardownApp(ctx: TestContext): Promise<void> {
  await ctx.app.close()
  await ctx.mockSidecar.close()
}
