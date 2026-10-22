/**
 * "My info" storage. The profile is the most sensitive data in the app, so it
 * is only written to disk encrypted with Electron safeStorage (macOS Keychain).
 * Without secure storage it lives in memory for this session only.
 * Test mode uses a plain file under the test user-data folder, so automated
 * runs never touch the Keychain; tests only ever store made-up values.
 */
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sanitizeProfile, type ProfileLoadResult, type ProfileSaveResult } from '../../shared/redact/ipc'
import type { Profile } from '../../shared/redact/types'
import { IS_TEST_MODE } from '../testMode'

const EMPTY: Profile = { people: [] }

let memoryOnly: Profile = EMPTY

const SECURE_FILE = 'my-info.bin'
const TEST_FILE = 'my-info.test.json'

function file(): string {
  return join(app.getPath('userData'), IS_TEST_MODE ? TEST_FILE : SECURE_FILE)
}

/** A plain-text test file must never sit next to a real install's data. */
function removeStrayTestFile(): void {
  if (IS_TEST_MODE) return
  try {
    rmSync(join(app.getPath('userData'), TEST_FILE), { force: true })
  } catch {
    // Nothing to do: the next load tries again.
  }
}

function canPersist(): boolean {
  return IS_TEST_MODE || safeStorage.isEncryptionAvailable()
}

export function loadProfile(): ProfileLoadResult {
  removeStrayTestFile()
  if (!canPersist()) return { profile: memoryOnly, persisted: false }
  const path = file()
  if (!existsSync(path)) return { profile: EMPTY, persisted: true }
  try {
    const raw = readFileSync(path)
    const json = IS_TEST_MODE ? raw.toString('utf8') : safeStorage.decryptString(raw)
    const profile = sanitizeProfile(JSON.parse(json))
    return profile ? { profile, persisted: true } : { profile: EMPTY, persisted: true, error: 'unreadable' }
  } catch {
    return { profile: EMPTY, persisted: true, error: 'unreadable' }
  }
}

export function saveProfile(value: unknown): ProfileSaveResult {
  const profile = sanitizeProfile(value)
  if (!profile) return { ok: false, persisted: canPersist(), error: 'invalid' }
  if (!canPersist()) {
    memoryOnly = profile
    return { ok: true, persisted: false }
  }
  try {
    const json = JSON.stringify(profile)
    writeFileSync(file(), IS_TEST_MODE ? json : safeStorage.encryptString(json), { mode: 0o600 })
    return { ok: true, persisted: true }
  } catch {
    return { ok: false, persisted: true, error: 'write_failed' }
  }
}

export function clearProfile(): { ok: boolean } {
  memoryOnly = EMPTY
  try {
    for (const name of [SECURE_FILE, TEST_FILE]) rmSync(join(app.getPath('userData'), name), { force: true })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
