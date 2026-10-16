import { createHash, randomUUID } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import { pipeline } from 'stream/promises'

export async function importModelFile(source: string, destination: string, bytes: number, sha256: string): Promise<void> {
  if ((await stat(source)).size !== bytes) throw new Error('Model size mismatch')
  await mkdir(dirname(destination), { recursive: true })
  const staged = `${destination}.${randomUUID()}.importing`
  try {
    await pipeline(createReadStream(source), createWriteStream(staged, { flags: 'wx' }))
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(staged)) hash.update(chunk)
    if (hash.digest('hex') !== sha256) throw new Error('Model SHA256 mismatch')
    await rename(staged, destination)
  } finally { await rm(staged, { force: true }) }
}
