import { lstatSync, readFileSync, realpathSync } from 'fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path))
}

/** Quiet acceptance uses production behaviour, with a separately marked disposable profile. */
export function resolveAutomationProfile(
  env: NodeJS.ProcessEnv,
  defaultProfile: string,
  testMode: boolean,
): string | undefined {
  const keys = ['CELLSENTRY_AUTOMATION_MODE', 'CELLSENTRY_AUTOMATION_HIDDEN', 'CELLSENTRY_AUTOMATION_USER_DATA']
  if (!keys.some(key => env[key] !== undefined)) return undefined
  const profile = env.CELLSENTRY_AUTOMATION_USER_DATA ?? ''
  if (testMode || env.CELLSENTRY_AUTOMATION_MODE !== '1' || env.CELLSENTRY_AUTOMATION_HIDDEN !== '1' || !isAbsolute(profile)) {
    throw new Error('Automation requires production mode, hidden windows and an absolute isolated profile')
  }
  const directory = resolve(profile)
  let realDefault = resolve(defaultProfile)
  try { realDefault = realpathSync(realDefault) } catch { /* a first user launch has no profile yet */ }
  if ([realDefault, resolve(defaultProfile)].some(defaultPath => contains(defaultPath, directory) || contains(directory, defaultPath))
    || realpathSync(directory) !== directory || !lstatSync(directory).isDirectory()) {
    throw new Error('Automation profile must be independent and use its physical directory path')
  }
  const marker = join(directory, '.cellsentry-automation')
  if (!lstatSync(marker).isFile() || readFileSync(marker, 'utf8') !== 'isolated automation profile\n') {
    throw new Error('Automation profile is missing its isolation marker')
  }
  return directory
}
