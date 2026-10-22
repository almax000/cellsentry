import { realpath, stat } from 'fs/promises'
import { resolve } from 'path'

/** Reject aliases as well as the spelling of the input path before any write. */
export async function assertDistinctOutput(sourcePath: string, outputPath: string): Promise<void> {
  if (!sourcePath) throw new Error('The source file path is required for a safe export')
  const source = resolve(sourcePath)
  const output = resolve(outputPath)
  if (source === output) throw new Error('Refusing to overwrite the source file')
  const [sourceReal, sourceStat] = await Promise.all([realpath(source), stat(source)])
  try {
    const [outputReal, outputStat] = await Promise.all([realpath(output), stat(output)])
    if (sourceReal === outputReal || (sourceStat.dev === outputStat.dev && sourceStat.ino === outputStat.ino)) {
      throw new Error('Refusing to overwrite the source file')
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
