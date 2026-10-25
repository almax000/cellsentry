import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { resolveAutomationProfile } from '../electron/main/automation'

describe('isolated production automation', () => {
  let directory: string
  let profile: string
  const testRoot = join(__dirname, '../tmp/automation-unit')
  const defaultProfile = join(testRoot, 'real-user-profile')
  beforeEach(() => {
    mkdirSync(testRoot, { recursive: true })
    directory = realpathSync(mkdtempSync(join(testRoot, 'profile-')))
    profile = join(directory, 'profile')
    mkdirSync(profile)
    writeFileSync(join(profile, '.cellsentry-automation'), 'isolated automation profile\n')
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))
  const env = () => ({ CELLSENTRY_AUTOMATION_MODE: '1', CELLSENTRY_AUTOMATION_HIDDEN: '1', CELLSENTRY_AUTOMATION_USER_DATA: profile })

  it('leaves ordinary launches unchanged', () => {
    expect(resolveAutomationProfile({}, defaultProfile, false)).toBeUndefined()
  })
  it('requires explicit mode, hidden window and a marked independent absolute profile', () => {
    expect(resolveAutomationProfile(env(), defaultProfile, false)).toBe(profile)
    for (const key of Object.keys(env())) {
      expect(() => resolveAutomationProfile({ ...env(), [key]: undefined }, defaultProfile, false)).toThrow()
    }
    expect(() => resolveAutomationProfile({ ...env(), CELLSENTRY_AUTOMATION_USER_DATA: 'relative' }, defaultProfile, false)).toThrow()
    expect(() => resolveAutomationProfile(env(), profile, false)).toThrow()
  })
  it('rejects test mode and unmarked or linked profiles before any launch', () => {
    expect(() => resolveAutomationProfile(env(), defaultProfile, true)).toThrow()
    rmSync(join(profile, '.cellsentry-automation'))
    expect(() => resolveAutomationProfile(env(), defaultProfile, false)).toThrow()
    if (process.platform !== 'win32') {
      const alias = join(directory, 'alias')
      symlinkSync(profile, alias)
      writeFileSync(join(profile, '.cellsentry-automation'), 'isolated automation profile\n')
      expect(() => resolveAutomationProfile({ ...env(), CELLSENTRY_AUTOMATION_USER_DATA: alias }, defaultProfile, false)).toThrow()
    }
  })
  it('rejects either profile containing the other', () => {
    expect(() => resolveAutomationProfile(env(), directory, false)).toThrow()
    expect(() => resolveAutomationProfile(env(), join(profile, 'real-user'), false)).toThrow()
  })
})
