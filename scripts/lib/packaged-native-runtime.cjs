const assert = require('node:assert/strict')
const { lstat, readdir, readFile, realpath, stat } = require('node:fs/promises')
const { isAbsolute, join, relative, resolve, sep } = require('node:path')

function inside(root, candidate) {
  const path = relative(root, candidate)
  return path !== '' && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path)
}

async function assertNoDocumentReader(dir, physicalRoot, visited) {
  const physicalDir = await realpath(dir)
  assert(physicalDir === physicalRoot || inside(physicalRoot, physicalDir), 'packaged native directory escapes its runtime directory')
  if (visited.has(physicalDir)) return
  visited.add(physicalDir)
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    assert.notEqual(entry.name, 'cellsentry-docreader', `document reader must not be packaged: ${entryPath}`)
    if (entry.isSymbolicLink()) {
      const target = await realpath(entryPath)
      assert(target === physicalRoot || inside(physicalRoot, target), 'packaged native link escapes its runtime directory')
      if ((await stat(entryPath)).isDirectory()) await assertNoDocumentReader(entryPath, physicalRoot, visited)
    } else if (entry.isDirectory()) await assertNoDocumentReader(entryPath, physicalRoot, visited)
  }
}

/**
 * Verify the native runtime exactly as the packaged app resolves it: runtime.json
 * owns the executable location so a versioned llama directory is valid, but the
 * path must remain inside the packaged runtime root.
 */
async function verifyPackagedNativeRuntime(runtimeRoot) {
  const physicalRoot = await realpath(runtimeRoot)
  const manifestPath = join(runtimeRoot, 'runtime.json')
  let runtime
  try {
    runtime = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`packaged native runtime has invalid runtime.json: ${error.message}`)
  }
  assert.equal(typeof runtime.executable, 'string', 'packaged native runtime manifest must name an executable')
  assert(runtime.executable.length > 0, 'packaged native runtime manifest executable is empty')
  assert(!isAbsolute(runtime.executable), 'packaged native runtime manifest executable must be relative')

  const executable = resolve(runtimeRoot, runtime.executable)
  assert(inside(resolve(runtimeRoot), executable), 'packaged native runtime manifest executable escapes its runtime directory')
  let executableStat
  try {
    executableStat = await lstat(executable)
  } catch {
    throw new Error(`audit native runtime executable missing from packaged app: ${runtime.executable}`)
  }
  assert(inside(physicalRoot, await realpath(executable)), 'packaged native runtime executable escapes its runtime directory')
  assert(executableStat.isFile(), `audit native runtime executable is not a regular file: ${runtime.executable}`)
  // Windows cannot represent the POSIX execute bits of a Mac bundle fixture.
  if (process.platform !== 'win32') assert((executableStat.mode & 0o111) !== 0, `audit native runtime executable is not executable: ${runtime.executable}`)
  await assertNoDocumentReader(runtimeRoot, physicalRoot, new Set())
  return executable
}

module.exports = { verifyPackagedNativeRuntime }
