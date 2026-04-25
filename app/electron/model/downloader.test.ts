/**
 * Unit tests for the v2 ModelDownloader pure helpers (W1 Step 1.3 / AD10).
 *
 * Network-touching paths (`fetchOneFileNet` / `_nodeRequest`) are out of
 * scope for unit tests — those get a manual smoke test in W2. Here we cover:
 *   (a) DirectoryModel size aggregation
 *   (b) per-file sha256 mismatch surfaces a clear error
 *   (c) locale routing returns correct base URL ordering
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import {
  closeSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  aggregateModelSize,
  buildUrlsForDirectoryFile,
  buildUrlsForSingleFile,
  checkModelOnDisk,
  verifyChecksumSync,
  type DirectoryModel,
  type SingleFileModel,
} from './downloader'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SINGLE: SingleFileModel = {
  kind: 'single-file',
  name: 'V1 GGUF (legacy)',
  version: 'v1',
  description: 'Legacy v1 single-file model — kept for shape coverage.',
  filename: 'legacy.gguf',
  size: 1024,
  sha256: 'a'.repeat(64),
  downloadUrl: 'https://huggingface.co/x/y/resolve/main/legacy.gguf',
  mirrorUrl: 'https://hf-mirror.com/x/y/resolve/main/legacy.gguf',
  cnPrimaryUrl: 'https://modelscope.cn/models/x/y/resolve/master/legacy.gguf',
}

const DIR: DirectoryModel = {
  kind: 'directory',
  name: 'V2 Directory Fixture',
  version: 'v2',
  description: 'Synthetic 3-file directory model for tests.',
  localDirName: 'fixture-model',
  files: [
    { path: 'config.json', size: 200, sha256: 'b'.repeat(64) },
    { path: 'tokenizer.json', size: 400, sha256: 'c'.repeat(64) },
    { path: 'shards/weights-00001-of-00002.safetensors', size: 5000, sha256: 'd'.repeat(64) },
  ],
  aggregateSize: 5600, // 200 + 400 + 5000
  baseUrls: {
    hf: 'https://huggingface.co/owner/repo/resolve/main',
    mirror: 'https://hf-mirror.com/owner/repo/resolve/main',
    ms: 'https://modelscope.cn/models/owner/repo/resolve/master',
  },
}

// ---------------------------------------------------------------------------
// (a) DirectoryModel size aggregation
// ---------------------------------------------------------------------------

describe('aggregateModelSize', () => {
  it('sums file sizes for a DirectoryModel', () => {
    expect(aggregateModelSize(DIR)).toBe(5600)
  })

  it('returns the single-file size for a SingleFileModel', () => {
    expect(aggregateModelSize(SINGLE)).toBe(1024)
  })

  it('returns 0 for an empty DirectoryModel (W1 placeholder behavior)', () => {
    const empty: DirectoryModel = { ...DIR, files: [], aggregateSize: 0 }
    expect(aggregateModelSize(empty)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// (b) per-file sha256 mismatch surfaces clear error (via verifyChecksumSync)
// ---------------------------------------------------------------------------

describe('verifyChecksumSync', () => {
  it('accepts when sha256 matches', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-test-'))
    try {
      const filePath = join(tmp, 'sample.bin')
      const content = Buffer.from('hello cellsentry v2', 'utf-8')
      writeFileSync(filePath, content)
      const expected = createHash('sha256').update(content).digest('hex')
      expect(verifyChecksumSync(filePath, expected)).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('rejects when sha256 differs (mismatch path)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-test-'))
    try {
      const filePath = join(tmp, 'tampered.bin')
      writeFileSync(filePath, Buffer.from('the real content'))
      const wrongSha = 'f'.repeat(64)
      expect(verifyChecksumSync(filePath, wrongSha)).toBe(false)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('treats empty expected sha256 as "skip verify" (returns true)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-test-'))
    try {
      const filePath = join(tmp, 'no-sha.bin')
      writeFileSync(filePath, Buffer.from('whatever'))
      expect(verifyChecksumSync(filePath, '')).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('handles files larger than one chunk (8 MB) — no off-by-one in streaming hash', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-test-'))
    try {
      const filePath = join(tmp, 'big.bin')
      // 9 MB of deterministic content so we cross the 8 MB chunk boundary.
      const fd = openSync(filePath, 'w')
      const hash = createHash('sha256')
      try {
        const chunk = Buffer.alloc(1024 * 1024, 0x55)
        for (let i = 0; i < 9; i++) {
          writeSync(fd, chunk)
          hash.update(chunk)
        }
      } finally {
        closeSync(fd)
      }
      const expected = hash.digest('hex')
      expect(verifyChecksumSync(filePath, expected)).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// (c) locale routing returns correct base URL ordering
// ---------------------------------------------------------------------------

describe('buildUrlsForSingleFile (locale routing)', () => {
  it('prefers HuggingFace for non-Chinese locales', () => {
    const urls = buildUrlsForSingleFile(SINGLE, 'en')
    expect(urls[0]).toContain('huggingface.co')
    expect(urls[1]).toContain('hf-mirror.com')
    expect(urls[2]).toContain('modelscope.cn')
  })

  it('prefers ModelScope for zh-CN (and zh-* generally)', () => {
    const urls = buildUrlsForSingleFile(SINGLE, 'zh-CN')
    expect(urls[0]).toContain('modelscope.cn')
    expect(urls[1]).toContain('hf-mirror.com')
    expect(urls[2]).toContain('huggingface.co')
  })

  it('treats zh-TW the same as zh-CN (any zh-* prefix)', () => {
    const urls = buildUrlsForSingleFile(SINGLE, 'zh-TW')
    expect(urls[0]).toContain('modelscope.cn')
  })

  it('omits absent fallbacks rather than returning undefined', () => {
    const stripped: SingleFileModel = { ...SINGLE, mirrorUrl: undefined, cnPrimaryUrl: undefined }
    expect(buildUrlsForSingleFile(stripped, 'en')).toEqual([SINGLE.downloadUrl])
    expect(buildUrlsForSingleFile(stripped, 'zh-CN')).toEqual([SINGLE.downloadUrl])
  })
})

describe('buildUrlsForDirectoryFile (locale routing + path joining)', () => {
  it('appends the file path to each base URL', () => {
    const urls = buildUrlsForDirectoryFile(DIR, DIR.files[0], 'en')
    expect(urls[0]).toBe(`${DIR.baseUrls.hf}/${DIR.files[0].path}`)
    expect(urls[1]).toBe(`${DIR.baseUrls.mirror}/${DIR.files[0].path}`)
    expect(urls[2]).toBe(`${DIR.baseUrls.ms}/${DIR.files[0].path}`)
  })

  it('reverses HF / MS priority for zh-CN', () => {
    const urls = buildUrlsForDirectoryFile(DIR, DIR.files[0], 'zh-CN')
    expect(urls[0]).toBe(`${DIR.baseUrls.ms}/${DIR.files[0].path}`)
    expect(urls[2]).toBe(`${DIR.baseUrls.hf}/${DIR.files[0].path}`)
  })

  it('preserves nested file paths (no flattening of "/")', () => {
    const nested = DIR.files[2] // shards/weights-00001-of-00002.safetensors
    const urls = buildUrlsForDirectoryFile(DIR, nested, 'en')
    expect(urls[0]).toContain('shards/weights-00001-of-00002.safetensors')
  })

  it('strips trailing slashes from base URLs to avoid // in joined URL', () => {
    const trailing: DirectoryModel = {
      ...DIR,
      baseUrls: { ...DIR.baseUrls, hf: `${DIR.baseUrls.hf}/` },
    }
    const urls = buildUrlsForDirectoryFile(trailing, DIR.files[0], 'en')
    expect(urls[0]).not.toMatch(/[^:]\/\//) // no double-slash except after `https:`
  })
})

// ---------------------------------------------------------------------------
// checkModelOnDisk (vacuous-true behavior for empty registry)
// ---------------------------------------------------------------------------

describe('checkModelOnDisk', () => {
  it('returns true for an empty DirectoryModel regardless of disk state (W1 placeholder)', () => {
    const empty: DirectoryModel = { ...DIR, files: [], aggregateSize: 0 }
    expect(checkModelOnDisk(empty, '/nonexistent/dir')).toBe(true)
  })

  it('returns false when a directory model file is missing on disk', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-test-'))
    try {
      // Don't create any files — directory exists but expected files missing.
      expect(checkModelOnDisk(DIR, tmp)).toBe(false)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('returns false when a single-file model file is missing on disk', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cs-test-'))
    try {
      expect(checkModelOnDisk(SINGLE, tmp)).toBe(false)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
