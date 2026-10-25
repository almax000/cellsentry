// This module must run before importing services which capture userData/model paths.
import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { IS_TEST_MODE } from '../testMode'
import { resolveAutomationProfile } from './automation'

const automationProfile = resolveAutomationProfile(process.env, app.getPath('userData'), IS_TEST_MODE)
if (automationProfile) {
  app.setPath('userData', automationProfile)
  const sessionData = join(automationProfile, 'chromium')
  mkdirSync(sessionData, { recursive: true })
  app.setPath('sessionData', sessionData)
} else if (IS_TEST_MODE && process.env.CELLSENTRY_TEST_USER_DATA) {
  mkdirSync(process.env.CELLSENTRY_TEST_USER_DATA, { recursive: true })
  app.setPath('userData', process.env.CELLSENTRY_TEST_USER_DATA)
}

export const IS_HIDDEN_RUN = automationProfile !== undefined || (IS_TEST_MODE && process.env.CELLSENTRY_TEST_HIDDEN === '1')
