/**
 * End-to-end check of the native macOS document reader on synthetic fixtures.
 *   node --test scripts/test-docreader-native.mjs
 * Compiles cellsentry-docreader and the fixture generator into a temporary directory,
 * reads every fixture in one run, and removes the directory afterwards. macOS only.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const OCR_FILES = ['scanned.pdf', 'scanned-rotated.pdf', 'scanned-footer.pdf',
  'photo.png', 'photo.heic', 'rotated.jpg', 'sideways.png', 'skewed.png']
const FILES = ['text.pdf', ...OCR_FILES, 'print-locked.pdf', 'two-pages.tiff',
  'locked.pdf', 'restricted.pdf', 'huge.png', 'many-pages.pdf', 'broken.pdf', 'broken.png', 'notes.docx', 'missing.pdf']

/** A valid 20000 × 20000 one-bit PNG (400 M pixels, a few dozen KB); the reader must refuse it before decoding. */
function hugePng() {
  const side = 20000
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(side, 0)
  header.writeUInt32BE(side, 4)
  header[8] = 1 // bit depth
  header[9] = 0 // grayscale
  // Each row: filter byte 0, then side / 8 bytes of zero pixels.
  const pixels = deflateSync(Buffer.alloc(side * (1 + side / 8)))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))])
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const lines = []
    let pending = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      pending += chunk
      let index
      while ((index = pending.indexOf('\n')) >= 0) {
        lines.push({ at: performance.now(), line: pending.slice(0, index) })
        pending = pending.slice(index + 1)
      }
    })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, lines, stderr, trailing: pending }))
  })
}

describe('cellsentry-docreader (native)', { skip: process.platform !== 'darwin' && 'macOS only' }, () => {
  let work
  let binary
  let fixtures
  let output
  const byFile = new Map()
  const pageMs = new Map()
  const fileMs = new Map()

  before(async () => {
    work = mkdtempSync(join(tmpdir(), 'cellsentry-docreader-'))
    binary = join(work, 'cellsentry-docreader')
    execFileSync(process.execPath, [join(root, 'scripts/build-docreader.mjs'), '--out', binary], { stdio: 'inherit' })
    const maker = join(work, 'make-fixtures')
    const triple = `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos13.0`
    execFileSync('xcrun', ['swiftc', '-target', triple, '-o', maker, join(root, 'native/docreader/make-fixtures.swift')],
      { stdio: 'inherit' })
    fixtures = join(work, 'fixtures')
    execFileSync(maker, [fixtures], { stdio: 'inherit' })
    writeFileSync(join(fixtures, 'huge.png'), hugePng())

    const started = performance.now()
    output = await run(binary, FILES.map((name) => join(fixtures, name)))
    // Times are measured when lines arrive, so they include process start for the first file.
    let last = started
    for (const { at, line } of output.lines) {
      const event = JSON.parse(line)
      if (event.file !== undefined) {
        const name = FILES[event.file]
        if (!byFile.has(name)) { byFile.set(name, []); fileMs.set(name, -last) }
        byFile.get(name).push(event)
        if (event.type === 'page') pageMs.set(`${name}#${event.page}`, Math.round(at - last))
        if (event.type === 'end') fileMs.set(name, Math.round(fileMs.get(name) + at))
      }
      last = at
    }
  })

  after(() => { if (work) rmSync(work, { recursive: true, force: true }) })

  const pages = (name) => byFile.get(name).filter((event) => event.type === 'page')
  const errors = (name) => byFile.get(name).filter((event) => event.type === 'error')

  test('writes one valid JSON object per line and finishes every file', () => {
    assert.equal(output.code, 0)
    assert.equal(output.trailing, '', 'last line must end with a newline')
    assert.deepEqual(JSON.parse(output.lines.at(-1).line), { type: 'done' })
    for (const name of FILES) assert.deepEqual(byFile.get(name).at(-1), { type: 'end', file: FILES.indexOf(name) })
  })

  test('PDF with a text layer is read from the text layer', () => {
    const [start] = byFile.get('text.pdf')
    assert.deepEqual({ ...start, path: undefined }, { type: 'start', file: 0, path: undefined, kind: 'pdf', pages: 1 })
    const [page] = pages('text.pdf')
    assert.equal(page.source, 'text')
    for (const expected of ['姓名：测试甲', '13800000000', '总胆固醇', '5.6 mmol/L', 'TEST-0001']) {
      assert.ok(page.text.includes(expected), `text layer lacks ${expected}`)
    }
  })

  for (const name of OCR_FILES) {
    test(`${name} is recognised by OCR with the form layout kept`, (t) => {
      assert.deepEqual(errors(name), [])
      const [page] = pages(name)
      assert.equal(page.source, 'ocr')
      const compact = page.text.replace(/\s+/g, '')
      assert.ok(compact.includes('测试'), 'OCR text lacks 测试')
      assert.ok(compact.includes('13800000000'), 'OCR text lacks the phone number')
      const lines = page.text.split('\n')
      assert.ok(lines.some((line) => /测试.*\s{2}.*性别/.test(line)), 'name and sex fields should share one line')
      assert.ok(lines.some((line) => /胆固醇.*5\.6.*mmol/.test(line)), 'table row should stay on one line')
      t.diagnostic(`${name}: ${pageMs.get(`${name}#1`)} ms`)
    })
  }

  test('a PDF that forbids printing but allows copying is read from its text layer', () => {
    assert.deepEqual(errors('print-locked.pdf'), [])
    const [page] = pages('print-locked.pdf')
    assert.equal(page.source, 'text')
    assert.ok(page.text.includes('13800000000'))
  })

  test('a two-page TIFF is read page by page', () => {
    const [start] = byFile.get('two-pages.tiff')
    assert.equal(start.kind, 'image')
    assert.equal(start.pages, 2)
    assert.deepEqual(errors('two-pages.tiff'), [])
    const read = pages('two-pages.tiff')
    assert.deepEqual(read.map((page) => page.page), [1, 2])
    for (const page of read) {
      assert.equal(page.source, 'ocr')
      assert.ok(page.text.replace(/\s+/g, '').includes('13800000000'), `page ${page.page} lacks the phone number`)
    }
  })

  test('PDF page limit: first 200 pages read, then one too_many_pages error', () => {
    const [start] = byFile.get('many-pages.pdf')
    assert.equal(start.pages, 201)
    const read = pages('many-pages.pdf')
    assert.equal(read.length, 200)
    assert.ok(read.every((page) => page.source === 'text'))
    assert.ok(read[199].text.includes('第200页'))
    assert.deepEqual(errors('many-pages.pdf').map(({ code, page }) => ({ code, page })), [{ code: 'too_many_pages', page: undefined }])
  })

  test('encrypted, damaged, missing and unsupported files report their error codes', () => {
    const expected = { 'locked.pdf': 'encrypted', 'restricted.pdf': 'restricted', 'huge.png': 'too_large', 'broken.pdf': 'unreadable', 'broken.png': 'unreadable',
      'missing.pdf': 'unreadable', 'notes.docx': 'unsupported' }
    for (const [name, code] of Object.entries(expected)) {
      const events = byFile.get(name)
      assert.deepEqual(events.map((event) => event.type), ['error', 'end'], name)
      assert.equal(events[0].code, code, name)
      assert.equal(events[0].page, undefined, name)
      assert.match(events[0].message, /^[\x20-\x7e]+$/, `${name}: message should be a short English sentence`)
    }
  })

  test('--text-only never recognizes text: photos and scanned pages are reported, text layers are kept', async () => {
    const names = ['text.pdf', 'scanned.pdf', 'scanned-footer.pdf', 'photo.png', 'short-pages.pdf']
    const result = await run(binary, ['--text-only', '--', ...names.map((name) => join(fixtures, name))])
    assert.equal(result.code, 0)
    const events = result.lines.map(({ line }) => JSON.parse(line))
    const of = (index) => events.filter((event) => event.file === index && event.type !== 'end')
    // A text PDF reads as before.
    assert.deepEqual(of(0).map((event) => [event.type, event.source]), [['start', undefined], ['page', 'text']])
    // A scanned page gives no text, only needs_ocr for that page.
    assert.deepEqual(of(1).map((event) => [event.type, event.code, event.page]), [['start', undefined, undefined], ['error', 'needs_ocr', 1]])
    // A scan with a typed footer keeps the footer and says the picture was not read.
    const footer = of(2)
    assert.deepEqual(footer.map((event) => [event.type, event.source ?? event.code]), [['start', undefined], ['page', 'text'], ['error', 'needs_ocr']])
    assert.ok(footer[1].text.includes('打印时间'))
    assert.ok(!footer[1].text.includes('13800000000'), 'the scanned part must not be read')
    // A photo is refused before anything is decoded.
    assert.deepEqual(of(3).map((event) => [event.type, event.code, event.page]), [['error', 'needs_ocr', undefined]])
    // Pages without a picture are read as they are, even a short line or a blank page; nothing is reported.
    const short = of(4)
    assert.deepEqual(short.map((event) => [event.type, event.page, event.code]),
      [['start', undefined, undefined], ['page', 1, undefined], ['page', 2, undefined], ['page', 3, undefined]])
    assert.ok(short[2].text.includes('报告医师'))
    assert.equal(short[3].text, '')
    assert.deepEqual(events.at(-1), { type: 'done' })
  })

  test('an unknown option before -- is a usage error', () => {
    const result = spawnSync(binary, ['--bogus', '--', join(fixtures, 'text.pdf')], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
  })

  test('stderr carries no document text', () => {
    for (const secret of ['测试', '13800000000', '胆固醇', 'TEST-0001']) assert.ok(!output.stderr.includes(secret))
  })

  test('no arguments is a usage error with exit code 2 and no stdout', () => {
    const result = spawnSync(binary, [], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /usage/)
  })

  test('timing diagnostics', (t) => {
    const ocr = OCR_FILES.map((name) => pageMs.get(`${name}#1`))
    t.diagnostic(`OCR page ms: min ${Math.min(...ocr)}, max ${Math.max(...ocr)}`)
    t.diagnostic(`many-pages.pdf (200 text-layer pages read): ${fileMs.get('many-pages.pdf')} ms`)
    t.diagnostic(`whole run of ${FILES.length} files: ${Math.round(output.lines.at(-1).at - output.lines[0].at)} ms after first line`)
  })
})
