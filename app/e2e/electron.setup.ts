import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { dirname, join } from 'path'

/** Reject an incomplete macOS bundle before dyld can crash and queue a system dialog. */
function validateElectronExecutable(executable: string): void {
  if (!existsSync(executable)) throw new Error('Electron executable is missing; set CELLSENTRY_E2E_ELECTRON to a complete installation')
  if (process.platform === 'darwin') {
    const framework = join(dirname(executable), '..', 'Frameworks', 'Electron Framework.framework', 'Electron Framework')
    if (!existsSync(framework)) throw new Error('Electron Framework is missing; set CELLSENTRY_E2E_ELECTRON to a complete installation')
  }
}

function electronExecutablePath(): string {
  // A worktree can share node_modules without a complete Electron bundle; point at one that has it.
  if (process.env.CELLSENTRY_E2E_ELECTRON) return process.env.CELLSENTRY_E2E_ELECTRON
  const electronPackageDir = join(__dirname, '..', 'node_modules', 'electron')
  if (process.platform === 'darwin') {
    return join(electronPackageDir, 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  }
  return join(electronPackageDir, 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
}

export interface TestContext {
  app: ElectronApplication
  page: Page
  rendererFailures: string[]
}

/**
 * Launch the Electron app for testing.
 *
 * Uses the application's real local Electron/IPC engines and a disposable
 * project-local user-data directory. No network or mock sidecar is involved.
 */
export async function launchApp(options: { xlsxGatePath?: string } = {}): Promise<TestContext> {
  const userDataDir = join(__dirname, '..', 'tmp', 'e2e', 'user-data', randomUUID())
  mkdirSync(userDataDir, { recursive: true })
  const packagedExecutable = process.env.CELLSENTRY_E2E_APP
  if (packagedExecutable && options.xlsxGatePath) {
    throw new Error('The source ExcelJS gate is not a packaged-app verification path')
  }
  const executable = packagedExecutable || electronExecutablePath()
  validateElectronExecutable(executable)
  const app = await electron.launch({
    executablePath: executable,
    args: packagedExecutable ? [] : ['--require', join(__dirname, 'exceljs-read-gate.cjs'), join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CELLSENTRY_TEST_MODE: '1',
      // Hidden by default so test runs never pop a window or steal focus; CELLSENTRY_E2E_VISIBLE=1 shows it.
      CELLSENTRY_TEST_HIDDEN: process.env.CELLSENTRY_E2E_VISIBLE === '1' ? '0' : '1',
      CELLSENTRY_TEST_USER_DATA: userDataDir,
      CELLSENTRY_MODEL_DIR: join(userDataDir, 'models'),
      // The source build's app path is out/main, so point it at the reader built into native/.
      ...(packagedExecutable ? {} : { CELLSENTRY_DOCREADER: join(__dirname, '..', '..', 'native', `${process.platform}-${process.arch}`, 'cellsentry-docreader') }),
      ...(options.xlsxGatePath ? { CELLSENTRY_E2E_XLSX_GATE: options.xlsxGatePath } : {}),
    }
  })

  if (packagedExecutable) {
    const identity = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      executable: process.execPath,
      appPath: app.getAppPath(),
      resources: process.resourcesPath,
      userData: app.getPath('userData'),
      version: app.getVersion(),
    }))
    writeFileSync(join(userDataDir, 'packaged-identity.json'), JSON.stringify(identity, null, 2))
    if (!identity.packaged || identity.userData !== userDataDir || identity.executable !== packagedExecutable) {
      await app.close()
      throw new Error('Packaged-app identity or profile isolation mismatch')
    }
  }

  const page = await app.firstWindow()
  const rendererFailures: string[] = []
  page.on('pageerror', (error) => rendererFailures.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    rendererFailures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`)
  })
  await page.waitForLoadState('domcontentloaded')
  // Give React time to render
  await page.waitForTimeout(1000)

  return { app, page, rendererFailures }
}

/**
 * Gracefully tear down the test context.
 */
export async function teardownApp(ctx: TestContext): Promise<void> {
  try {
    if (ctx.rendererFailures.length > 0) {
      throw new Error(`Unexpected renderer failures:\n${ctx.rendererFailures.join('\n')}`)
    }
  } finally {
    await ctx.app.close()
  }
}
