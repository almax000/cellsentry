import { createHash, randomUUID } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import { pipeline } from 'stream/promises'

export interface ModelImportOptions {
  signal?: AbortSignal
  onCopyProgress?: (copiedBytes: number, totalBytes: number) => void
  onVerifying?: () => void
}

export async function importModelFile(source: string, destination: string, bytes: number, sha256: string, options: ModelImportOptions = {}): Promise<void> {
  const { signal, onCopyProgress, onVerifying } = options
  signal?.throwIfAborted()
  if ((await stat(source)).size !== bytes) throw new Error('Model size mismatch')
  await mkdir(dirname(destination), { recursive: true })
  const staged = `${destination}.${randomUUID()}.importing`
  try {
    let copied = 0
    const input = createReadStream(source)
    input.on('data', (chunk: string | Buffer) => {
      copied += Buffer.byteLength(chunk)
      onCopyProgress?.(copied, bytes)
    })
    await pipeline(input, createWriteStream(staged, { flags: 'wx' }), { signal })
    onVerifying?.()
    const hash = createHash('sha256')
    let verifiedBytes = 0
    for await (const chunk of createReadStream(staged)) {
      signal?.throwIfAborted()
      verifiedBytes += chunk.length
      hash.update(chunk)
    }
    if (verifiedBytes !== bytes) throw new Error('Model size mismatch')
    if (hash.digest('hex') !== sha256) throw new Error('Model SHA256 mismatch')
    signal?.throwIfAborted()
    await rename(staged, destination)
  } finally { await rm(staged, { force: true }) }
}
