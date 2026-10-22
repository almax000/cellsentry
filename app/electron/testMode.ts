/**
 * Test mode turns on test-only hooks: a test API in the window, plain-text
 * "My info" storage, an in-memory clipboard and a reader path from the
 * environment. It needs two variables, so a stray CELLSENTRY_TEST_MODE in a
 * shell cannot switch a real install into it; the launcher must also name a
 * disposable user-data folder by absolute path, which is where anything test
 * mode writes ends up.
 */
import { isAbsolute } from 'path'

const TEST_USER_DATA = process.env.CELLSENTRY_TEST_USER_DATA ?? ''

export const IS_TEST_MODE = process.env.CELLSENTRY_TEST_MODE === '1' && TEST_USER_DATA !== '' && isAbsolute(TEST_USER_DATA)
