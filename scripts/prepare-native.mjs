/** Downloads official CPU/Metal binaries; no Python, CUDA SDK or compiler required. */
import { readdir, mkdir, writeFile, chmod, copyFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { artifacts, version, downloadVerified } from './native-artifacts.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const key = process.argv[2] || `${process.platform}-${process.arch}`
if (!artifacts[key] || key === 'ios') throw new Error(`Use win32-x64, darwin-arm64 or darwin-x64; received ${key}`)
const target = join(root, 'native', key)
const archive = join(root, '.runtime', artifacts[key][0])
await downloadVerified(key, archive)
if (key.startsWith('darwin') && process.platform !== 'darwin') {
  console.log(`Verified ${key} archive. Run preparation on macOS to preserve dylib symlinks.`)
  process.exit(0)
}
await mkdir(target, { recursive: true })
execFileSync('tar', ['-xf', archive, '-C', target], { stdio: 'inherit' })
async function find(dir, name) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.name === name && entry.isFile()) return path
    if (entry.isDirectory()) { const result = await find(path, name); if (result) return result }
  }
}
const server = await find(target, key.startsWith('win32') ? 'llama-server.exe' : 'llama-server')
if (!server) throw new Error('Downloaded runtime contains no llama-server')
if (!key.startsWith('win32')) await chmod(server, 0o755)
await copyFile(join(root, 'native/LLAMA-LICENSE'), join(target, 'LLAMA-LICENSE'))
await writeFile(join(target, 'runtime.json'), JSON.stringify({ version, target: key,
  executable: relative(target, server).replaceAll('\\', '/'), archiveSha256: artifacts[key][1] }, null, 2) + '\n')
console.log(`Native runtime ready: ${server}`)
