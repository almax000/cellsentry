import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ runtimeDir: '/nonexistent-runtime' }))
vi.mock('../electron/model/paths', () => ({ getRuntimeDir: () => state.runtimeDir }))

import { readDocuments, type DocReaderEvent } from '../electron/docreader/reader'

const work = mkdtempSync(join(tmpdir(), 'docreader-test-'))
let counter = 0

/** Writes a fake reader: a node script that prints the given JSON Lines program. */
function fakeReader(body: string): string {
  const file = join(work, `fake-${counter++}.js`)
  writeFileSync(file, `#!${process.execPath}\nconst out = (o) => process.stdout.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\\n')\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

// Paths follow the "--" the wrapper always passes.
const fileDone = (file: number, kind: string, texts: string[]) => `
out({ type: 'start', file: ${file}, path: process.argv[process.argv.indexOf('--') + 1 + ${file}], kind: '${kind}', pages: ${texts.length} })
${texts.map((text, i) => `out({ type: 'page', file: ${file}, page: ${i + 1}, pages: ${texts.length}, source: '${kind === 'pdf' ? 'text' : 'ocr'}', text: ${JSON.stringify(text)} })`).join('\n')}
out({ type: 'end', file: ${file} })`

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { ...platform, value })
}

describe.skipIf(process.platform === 'win32')('readDocuments', () => {
  beforeEach(() => setPlatform('darwin'))
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    state.runtimeDir = '/nonexistent-runtime'
    vi.restoreAllMocks()
  })
  afterAll(() => rmSync(work, { recursive: true, force: true }))

  it('parses JSON Lines into per-file results and streams progress events in order', async () => {
    const binaryPath = fakeReader(`${fileDone(0, 'pdf', ['姓名：测试甲  性别：男', '总胆固醇 5.6 mmol/L'])}
${fileDone(1, 'image', ['电话：13800000000'])}
out({ type: 'done' })`)
    const paths = ['/docs/体检 报告 $(touch x) "q".pdf', '/docs/photo.heic']
    const events: DocReaderEvent[] = []
    const results = await readDocuments(paths, { binaryPath, onEvent: (event) => events.push(event) })

    expect(results).toEqual([
      { path: paths[0], kind: 'pdf', errors: [], pages: [
        { page: 1, source: 'text', text: '姓名：测试甲  性别：男' },
        { page: 2, source: 'text', text: '总胆固醇 5.6 mmol/L' },
      ] },
      { path: paths[1], kind: 'image', errors: [], pages: [{ page: 1, source: 'ocr', text: '电话：13800000000' }] },
    ])
    expect(events.map((event) => event.type)).toEqual(['start', 'page', 'page', 'end', 'start', 'page', 'end', 'done'])
    // Paths reach the reader as plain argv entries, never through a shell.
    expect(events[0]).toEqual({ type: 'start', file: 0, path: paths[0], kind: 'pdf', pages: 2 })
  })

  it('keeps other pages and files when one page or file fails', async () => {
    const binaryPath = fakeReader(`
out({ type: 'start', file: 0, path: 'a.pdf', kind: 'pdf', pages: 3 })
out({ type: 'page', file: 0, page: 1, pages: 3, source: 'text', text: 'page one' })
out({ type: 'error', file: 0, page: 2, code: 'ocr_failed', message: 'Text recognition failed.' })
out({ type: 'page', file: 0, page: 3, pages: 3, source: 'ocr', text: 'page three' })
out({ type: 'end', file: 0 })
out({ type: 'error', file: 1, code: 'unsupported', message: 'File type is not supported.' })
out({ type: 'end', file: 1 })
${fileDone(2, 'image', ['third'])}
out({ type: 'done' })`)
    const results = await readDocuments(['a.pdf', 'b.docx', 'c.png'], { binaryPath })

    expect(results[0].pages.map((page) => page.page)).toEqual([1, 3])
    expect(results[0].errors).toEqual([{ page: 2, code: 'ocr_failed', message: 'Text recognition failed.' }])
    expect(results[1]).toEqual({ path: 'b.docx', kind: null, pages: [],
      errors: [{ code: 'unsupported', message: 'File type is not supported.' }] })
    expect(results[2].pages).toEqual([{ page: 1, source: 'ocr', text: 'third' }])
    expect(results[2].errors).toEqual([])
  })

  it('turns unparseable or invalid lines into invalid_output errors without leaking their content', async () => {
    const binaryPath = fakeReader(`
out({ type: 'start', file: 0, path: 'a.png', kind: 'image', pages: 1 })
out('not json SECRET-MARKER')
out('{"type":"page","file":0,"text":"SECRET-MARKER')
out({ type: 'page', file: 9, page: 1, pages: 1, source: 'ocr', text: 'SECRET-MARKER' })
out({ type: 'error', file: 0, code: 'made_up', message: 'SECRET-MARKER' })
out('[1, 2]')
out({ type: 'page', file: 0, page: 1, pages: 1, source: 'ocr', text: 'kept' })
out({ type: 'end', file: 0 })
out({ type: 'page', file: 0, page: 2, pages: 1, source: 'ocr', text: 'SECRET-MARKER' })
out({ type: 'done' })`)
    const events: DocReaderEvent[] = []
    const results = await readDocuments(['a.png'], { binaryPath, onEvent: (event) => events.push(event) })

    expect(results[0].pages).toEqual([{ page: 1, source: 'ocr', text: 'kept' }])
    expect(results[0].errors).toHaveLength(6)
    expect(new Set(results[0].errors.map((error) => error.code))).toEqual(new Set(['invalid_output']))
    expect(JSON.stringify(results)).not.toContain('SECRET-MARKER')
    expect(JSON.stringify(events)).not.toContain('SECRET-MARKER')
  })

  it('reports reader_missing instead of throwing when the binary is absent or not executable', async () => {
    const missing = await readDocuments(['a.pdf', 'b.png'], { binaryPath: join(work, 'no-such-reader') })
    expect(missing.map((result) => result.errors.map((error) => error.code))).toEqual([['reader_missing'], ['reader_missing']])

    state.runtimeDir = work // default location: <runtime dir>/cellsentry-docreader, absent here
    const byDefault = await readDocuments(['a.pdf'])
    expect(byDefault[0].errors[0].code).toBe('reader_missing')

    const notExecutable = join(work, 'plain-file')
    writeFileSync(notExecutable, 'data')
    chmodSync(notExecutable, 0o644)
    const denied = await readDocuments(['a.pdf'], { binaryPath: notExecutable })
    expect(denied[0].errors[0].code).toBe('reader_missing')
  })

  it('finds the reader in the bundled runtime directory by default', async () => {
    const binaryPath = fakeReader(`${fileDone(0, 'pdf', ['default path'])}\nout({ type: 'done' })`)
    const runtime = mkdtempSync(join(work, 'runtime-'))
    writeFileSync(join(runtime, 'cellsentry-docreader'), readFileSync(binaryPath))
    chmodSync(join(runtime, 'cellsentry-docreader'), 0o755)
    state.runtimeDir = runtime
    const results = await readDocuments(['a.pdf'])
    expect(results[0].pages[0].text).toBe('default path')
  })

  it('returns unsupported_platform off macOS without starting the reader', async () => {
    const marker = join(work, 'started-on-linux')
    const binaryPath = fakeReader(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`)
    setPlatform('linux')
    const results = await readDocuments(['a.pdf'], { binaryPath })
    expect(results[0].errors).toEqual([{ code: 'unsupported_platform', message: expect.any(String) }])
    expect(() => readFileSync(marker)).toThrow()
  })

  it('cancels on abort: kills the reader, keeps finished files, marks the rest cancelled', async () => {
    const pidFile = join(work, 'cancel.pid')
    const binaryPath = fakeReader(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
${fileDone(0, 'pdf', ['finished before cancel'])}
out({ type: 'start', file: 1, path: process.argv[4], kind: 'image', pages: 1 })
setInterval(() => {}, 1000)`)
    const controller = new AbortController()
    const results = await readDocuments(['a.pdf', 'b.png', 'c.png'], {
      binaryPath,
      signal: controller.signal,
      onEvent: (event) => { if (event.type === 'start' && event.file === 1) controller.abort() },
    })

    expect(results[0]).toEqual({ path: 'a.pdf', kind: 'pdf', errors: [],
      pages: [{ page: 1, source: 'text', text: 'finished before cancel' }] })
    expect(results[1].kind).toBe('image')
    expect(results[1].errors.map((error) => error.code)).toEqual(['cancelled'])
    expect(results[2].errors.map((error) => error.code)).toEqual(['cancelled'])
    const pid = Number(readFileSync(pidFile, 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()

    const preAborted = await readDocuments(['a.pdf'], { binaryPath, signal: AbortSignal.abort() })
    expect(preAborted[0].errors.map((error) => error.code)).toEqual(['cancelled'])
  })

  it('times out: escalates to SIGKILL when SIGTERM is ignored and marks unfinished files', async () => {
    const pidFile = join(work, 'timeout.pid')
    const binaryPath = fakeReader(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
process.on('SIGTERM', () => {})
${fileDone(0, 'image', ['done in time'])}
setInterval(() => {}, 1000)`)
    // Generous limit so a slow node start-up still prints file 0 before the timeout fires.
    const started = Date.now()
    const results = await readDocuments(['a.png', 'b.png'], { binaryPath, timeoutMs: 1500 })

    expect(Date.now() - started).toBeGreaterThanOrEqual(1500 + 2000) // timeout, then SIGTERM grace, then SIGKILL
    expect(results[0].errors).toEqual([])
    expect(results[0].pages[0].text).toBe('done in time')
    expect(results[1].errors.map((error) => error.code)).toEqual(['timeout'])
    expect(() => process.kill(Number(readFileSync(pidFile, 'utf8')), 0)).toThrow()
  }, 15_000)

  it('stops once the text limit is passed, keeping what arrived and marking the rest', async () => {
    const binaryPath = fakeReader(`${fileDone(0, 'pdf', ['a'.repeat(60), 'b'.repeat(60)])}
${fileDone(1, 'pdf', ['never needed'])}
out({ type: 'done' })`)
    const results = await readDocuments(['a.pdf', 'b.pdf'], { binaryPath, maxTextChars: 100 })
    expect(results[0].pages.map((page) => page.text.length)).toEqual([60, 60])
    expect(results[0].errors.map((error) => error.code)).toEqual(['text_limit'])
    expect(results[1].pages).toEqual([])
    expect(results[1].errors.map((error) => error.code)).toEqual(['text_limit'])
  })

  it('stops a reader whose output line grows without end', async () => {
    const binaryPath = fakeReader(`out({ type: 'start', file: 0, path: 'a.pdf', kind: 'pdf', pages: 1 })
const chunk = 'x'.repeat(1024 * 1024)
process.stdout.write('{"type":"page","file":0,"page":1,"pages":1,"source":"text","text":"')
let sent = 0
const timer = setInterval(() => { process.stdout.write(chunk); if (++sent > 80) clearInterval(timer) }, 0)`)
    const results = await readDocuments(['a.pdf'], { binaryPath })
    expect(results[0].pages).toEqual([])
    expect(results[0].errors.map((error) => error.code)).toEqual(['text_limit'])
  }, 15_000)

  it('always puts the paths after --, so a path is never read as an option', async () => {
    const argsFile = join(work, 'args-default.json')
    const binaryPath = fakeReader(`require('fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)))
${fileDone(0, 'pdf', ['text'])}
out({ type: 'done' })`)
    await readDocuments(['--', 'b.pdf'], { binaryPath })
    expect(JSON.parse(readFileSync(argsFile, 'utf8'))).toEqual(['--', '--', 'b.pdf'])
  })

  it('asks the reader for text layers only when OCR is off, with options before --', async () => {
    const argsFile = join(work, 'args.json')
    const binaryPath = fakeReader(`require('fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)))
out({ type: 'error', file: 0, code: 'needs_ocr', message: 'Photos need text recognition, which is turned off.' })
out({ type: 'end', file: 0 })
${fileDone(1, 'pdf', ['text layer'])}
out({ type: 'done' })`)
    const results = await readDocuments(['a.png', 'b.pdf'], { binaryPath, ocr: false })
    expect(JSON.parse(readFileSync(argsFile, 'utf8'))).toEqual(['--text-only', '--', 'a.png', 'b.pdf'])
    expect(results[0].errors.map((error) => error.code)).toEqual(['needs_ocr'])
    expect(results[1].pages.map((page) => page.text)).toEqual(['text layer'])
  })

  it('stops a reader that prints nothing for the idle limit, keeping finished files', async () => {
    const pidFile = join(work, 'idle.pid')
    const binaryPath = fakeReader(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
${fileDone(0, 'pdf', ['done before the stall'])}
out({ type: 'start', file: 1, path: 'b.pdf', kind: 'pdf', pages: 3 })
setInterval(() => {}, 1000)`)
    const started = Date.now()
    const results = await readDocuments(['a.pdf', 'b.pdf'], { binaryPath, idleTimeoutMs: 1500 })
    expect(Date.now() - started).toBeLessThan(8000)
    expect(results[0].errors).toEqual([])
    expect(results[0].pages[0].text).toBe('done before the stall')
    expect(results[1].errors.map((error) => error.code)).toEqual(['timeout'])
    expect(() => process.kill(Number(readFileSync(pidFile, 'utf8')), 0)).toThrow()
  }, 15_000)

  it('keeps a slow reader going as long as it keeps printing', async () => {
    const binaryPath = fakeReader(`out({ type: 'start', file: 0, path: 'a.pdf', kind: 'pdf', pages: 6 })
let page = 0
const timer = setInterval(() => {
  page++
  out({ type: 'page', file: 0, page, pages: 6, source: 'text', text: 'page ' + page })
  if (page === 6) { clearInterval(timer); out({ type: 'end', file: 0 }); out({ type: 'done' }) }
}, 500)`)
    const results = await readDocuments(['a.pdf'], { binaryPath, idleTimeoutMs: 1500 })
    expect(results[0].errors).toEqual([])
    expect(results[0].pages).toHaveLength(6)
  }, 15_000)

  it('reports reader_failed when the reader exits early', async () => {
    const binaryPath = fakeReader(`${fileDone(0, 'pdf', ['ok'])}
out({ type: 'start', file: 1, path: 'b.pdf', kind: 'pdf', pages: 2 })
process.exit(3)`)
    const results = await readDocuments(['a.pdf', 'b.pdf'], { binaryPath })
    expect(results[0].errors).toEqual([])
    expect(results[1].errors.map((error) => error.code)).toEqual(['reader_failed'])
  })

  it('never logs and survives a throwing onEvent listener', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}))
    const binaryPath = fakeReader(`${fileDone(0, 'image', ['姓名：测试甲'])}\nout({ type: 'done' })`)
    const results = await readDocuments(['a.png'], { binaryPath, onEvent: () => { throw new Error('listener bug') } })
    expect(results[0].pages[0].text).toBe('姓名：测试甲')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('returns an empty list for no paths', async () => {
    await expect(readDocuments([], { binaryPath: join(work, 'no-such-reader') })).resolves.toEqual([])
  })
})
