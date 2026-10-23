/**
 * Compiles native/docreader/main.swift into native/darwin-<arch>/cellsentry-docreader.
 * macOS only, uses the local Xcode toolchain, downloads nothing.
 *
 *   node scripts/build-docreader.mjs [--arch arm64|x64] [--out <file>]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.log(`cellsentry-docreader is macOS-only; skipping build on ${process.platform}.`)
  process.exit(0)
}

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

const arch = option('--arch') ?? process.arch
// macOS 13 matches the bundled llama-server (minos 13.3) and gives Vision text recognition revision 3.
const triples = { arm64: 'arm64-apple-macos13.0', x64: 'x86_64-apple-macos13.0' }
if (!triples[arch]) throw new Error(`Unsupported arch ${arch}; use arm64 or x64`)

const source = join(root, 'native/docreader/main.swift')
const output = resolve(option('--out') ?? join(root, 'native', `darwin-${arch}`, 'cellsentry-docreader'))
mkdirSync(dirname(output), { recursive: true })
execFileSync('xcrun', ['swiftc', '-O', '-target', triples[arch], '-o', output, source], { stdio: 'inherit' })
console.log(`cellsentry-docreader ready: ${output}`)
