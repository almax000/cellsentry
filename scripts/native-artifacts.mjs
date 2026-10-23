import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const version = 'b11429'
export const artifacts = {
  'win32-x64': ['llama-b11429-bin-win-cpu-x64.zip', '1283323272b04cd07905816a597a0da810918102de958f4ff6f7bbaa70ed2efe'],
  'darwin-arm64': ['llama-b11429-bin-macos-arm64.tar.gz', '740288ec6887be94280a5dfa25b5e23a78285cab104519e6c7e218904ee82459'],
  'darwin-x64': ['llama-b11429-bin-macos-x64.tar.gz', '29ac3ea02be6bd143e824973f2cc5fa74bc4094393a9eaab0ff6814f19dd8522'],
  ios: ['llama-b11429-xcframework.zip', 'e26a6a0a813f5760fe45834ce239d5b525e4e2442d4fd017221d9f0438383174'],
}

export async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function downloadVerified(key, path) {
  const [name, hash] = artifacts[key] ?? []
  if (!name) throw new Error(`Unsupported native target: ${key}`)
  try { if (await digest(path) === hash) return } catch {}
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + '.partial'
  try {
    // curl inherits the caller's proxy configuration. Node's default fetch does
    // not consistently use HTTP(S)_PROXY across supported Node versions.
    await execFileAsync('curl', ['--fail', '--location', '--silent', '--show-error',
      '--max-time', '300', '--output', temporary,
      `https://github.com/ggml-org/llama.cpp/releases/download/${version}/${name}`])
    if (await digest(temporary) !== hash) throw new Error(`SHA256 mismatch: ${name}`)
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
