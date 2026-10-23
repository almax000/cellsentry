import { createHash, randomUUID } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import { pipeline } from 'stream/promises'

export async function importModelFile(source: string, destination: string, bytes: number, sha256: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  if ((await stat(source)).size !== bytes) throw new Error('Model size mismatch')
  await mkdir(dirname(destination), { recursive: true })
  const staged = `${destination}.${randomUUID()}.importing`
  try {
    await pipeline(createReadStream(source), createWriteStream(staged, { flags: 'wx' }), { signal })
    const hash = createHash('sha256')
    let copied = 0
    for await (const chunk of createReadStream(staged)) {
      signal?.throwIfAborted()
      copied += chunk.length
      hash.update(chunk)
    }
    if (copied !== bytes) throw new Error('Model size mismatch')
    if (hash.digest('hex') !== sha256) throw new Error('Model SHA256 mismatch')
    signal?.throwIfAborted()
    await rename(staged, destination)
  } finally { await rm(staged, { force: true }) }
}
