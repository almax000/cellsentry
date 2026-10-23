import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { lstat, mkdir, readdir, rename, rm, statfs } from 'fs/promises'
import { join } from 'path'
import { DEFAULT_MODEL } from './catalog'
import { importModelFile } from './importer'
import type { ModelSetupStatus } from '../../shared/api'

interface PackageFile { name: string; bytes: number; sha256: string }
export interface BundledModelSpec {
  version: string
  model: PackageFile
  metadata: readonly PackageFile[]
}

// Expectations ship in the app; the adjacent manifest is never its own authority.
export const BUNDLED_MODEL: BundledModelSpec = {
  version: DEFAULT_MODEL.version,
  model: { name: DEFAULT_MODEL.filename, bytes: DEFAULT_MODEL.size, sha256: DEFAULT_MODEL.sha256 },
  metadata: [
    { name: 'LICENSE', bytes: 11358, sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' },
    { name: 'NOTICE.txt', bytes: 435, sha256: '1a2cc06d37431499274cfb3e295060f2e6fb96971bf8f4c6338acbd034e72e02' },
    { name: 'manifest.json', bytes: 681, sha256: '7b24329ac0f216843c6c1820f411a7b796eb076107a086a20fc0e83e082cb2e4' },
    { name: 'SHA256SUMS', bytes: 340, sha256: 'b09b395ae51335bf7a6c7e8cd4908ff210f4cc7596815f32a12a83f408579673' },
  ],
}

let installationError: string | undefined
let setupStatus: ModelSetupStatus = { phase: 'idle' }
export function getBundledModelError(): string | undefined { return installationError }
export function setBundledModelError(error?: string): void { installationError = error }
export function getBundledModelSetupStatus(): ModelSetupStatus { return { ...setupStatus } }
export function isBundledModelPreparing(): boolean {
  return setupStatus.phase === 'copying' || setupStatus.phase === 'verifying'
}
export function markBundledModelReady(): void { setupStatus = { phase: 'ready' } }
export function modelSetupError(status: { modelLoaded: boolean; error?: string }): string | undefined {
  return status.modelLoaded ? undefined : installationError || status.error
}

async function fileExists(path: string): Promise<boolean> {
  try { await lstat(path); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}
async function verifyFile(path: string, expected: PackageFile, signal?: AbortSignal, onProgress?: (verifiedBytes: number) => void): Promise<boolean> {
  const info = await lstat(path)
  if (!info.isFile() || info.size !== expected.bytes) return false
  const hash = createHash('sha256')
  let verifiedBytes = 0
  for await (const chunk of createReadStream(path)) {
    signal?.throwIfAborted()
    verifiedBytes += chunk.length
    onProgress?.(verifiedBytes)
    hash.update(chunk)
  }
  return hash.digest('hex') === expected.sha256
}

/** Copies only from the sealed app payload; no network access or bundle writes. */
export async function installBundledModel({ packageDir, modelsDir, spec = BUNDLED_MODEL, signal, onProgress }: {
  packageDir: string; modelsDir: string; spec?: BundledModelSpec; signal?: AbortSignal
  onProgress?: (event: { phase: 'copying' | 'verifying'; copiedBytes: number; totalBytes: number }) => void
}): Promise<'installed' | 'already-installed' | 'not-bundled'> {
  signal?.throwIfAborted()
  // Lean updates preserve userData without a full startup hash/read.
  if (!await fileExists(packageDir)) return 'not-bundled'
  if (!(await lstat(packageDir)).isDirectory()) throw new Error('Offline package must be a regular directory')
  const destination = join(modelsDir, spec.model.name)
  if (await fileExists(destination) && await verifyFile(destination, spec.model, signal, (verifiedBytes) => {
    onProgress?.({ phase: 'verifying', copiedBytes: verifiedBytes, totalBytes: spec.model.bytes })
  })) return 'already-installed'
  const expected = [spec.model, ...spec.metadata]
  if (JSON.stringify((await readdir(packageDir)).sort()) !== JSON.stringify(expected.map(f => f.name).sort())) {
    throw new Error('Offline package file list mismatch')
  }
  for (const file of expected) {
    const info = await lstat(join(packageDir, file.name))
    if (!info.isFile() || info.size !== file.bytes) throw new Error('Offline package size or file type mismatch')
  }
  await mkdir(modelsDir, { recursive: true })
  // Owned by bootstrap before IPC starts. Recover a prior interrupted run.
  const staging = join(modelsDir, '.offline-importing')
  await rm(staging, { recursive: true, force: true })
  const disk = await statfs(modelsDir)
  if (disk.bavail * disk.bsize < Math.ceil(expected.reduce((sum, f) => sum + f.bytes, 0) * 1.1)) {
    throw new Error('Insufficient disk space for offline model installation')
  }
  try {
    for (const file of expected) {
      await importModelFile(join(packageDir, file.name), join(staging, file.name), file.bytes, file.sha256, {
        signal,
        onCopyProgress: file.name === spec.model.name
          ? (copiedBytes, totalBytes) => onProgress?.({ phase: 'copying', copiedBytes, totalBytes })
          : undefined,
        onVerifying: file.name === spec.model.name
          ? () => onProgress?.({ phase: 'verifying', copiedBytes: file.bytes, totalBytes: file.bytes })
          : undefined,
      })
    }
    // License and provenance survive lean updates. Commit the model last.
    const licenses = join(modelsDir, 'licenses', spec.version)
    await mkdir(licenses, { recursive: true })
    for (const file of spec.metadata) await rename(join(staging, file.name), join(licenses, file.name))
    signal?.throwIfAborted()
    await rename(join(staging, spec.model.name), destination)
    return 'installed'
  } finally { await rm(staging, { recursive: true, force: true }) }
}

/** Installs the bundled payload while publishing a renderer-safe setup state. */
export async function bootstrapBundledModel(options: {
  packageDir: string; modelsDir: string; spec?: BundledModelSpec; signal?: AbortSignal
}): Promise<'installed' | 'already-installed' | 'not-bundled'> {
  setBundledModelError()
  setupStatus = { phase: 'copying', copiedBytes: 0, totalBytes: (options.spec ?? BUNDLED_MODEL).model.bytes }
  try {
    const result = await installBundledModel({
      ...options,
      onProgress: (event) => { setupStatus = { ...event } },
    })
    setupStatus = { phase: result === 'not-bundled' ? 'not-bundled' : 'ready' }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Offline model installation failed'
    setBundledModelError(message)
    setupStatus = { phase: 'failed' }
    throw error
  }
}
