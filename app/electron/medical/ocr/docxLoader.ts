/**
 * DOCX text extraction (lean rebuild — D34).
 *
 * Uses mammoth.js to pull the document body as plain text. mammoth strips
 * styling and structural noise; what comes out is the human-readable content
 * the user actually wants pseudonymized.
 *
 * Why mammoth:
 *   - Pure JS (no LibreOffice / Pandoc dependency at runtime — same trap that
 *     killed the NextDoorLaoHuang reference tool).
 *   - 8 MB installed footprint vs. 800 MB+ for a LibreOffice headless setup.
 *   - Handles tables, lists, footnotes inline with no special config.
 *
 * Hidden-content security note: DOCX can carry hidden text (revisions, deleted
 * comments, document.xml.rels metadata). mammoth's default extraction surfaces
 * the visible body text. Day 6 may revisit if the dogfood corpus contains
 * hidden-content edge cases worth defending against.
 */

import { readFile } from 'fs/promises'

interface DocxTextResult {
  text: string
  /** Page count is not available from a DOCX; we report 1 logical page. */
  pages: Array<{ index: number; text: string }>
  latency_ms: number
}

type MammothModule = {
  extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }>
}

let _mammoth: MammothModule | null = null

async function getMammoth(): Promise<MammothModule | null> {
  if (_mammoth) return _mammoth
  try {
    const mod = await import('mammoth')
    const m = (mod as unknown as { default?: MammothModule }).default ?? (mod as unknown as MammothModule)
    _mammoth = m
    return m
  } catch {
    return null
  }
}

export async function extractDocxText(path: string): Promise<DocxTextResult | null> {
  const t0 = Date.now()
  const mammoth = await getMammoth()
  if (!mammoth) {
    return null
  }

  let buffer: Buffer
  try {
    buffer = await readFile(path)
  } catch {
    return null
  }

  let extracted: { value: string }
  try {
    extracted = await mammoth.extractRawText({ buffer })
  } catch {
    return null
  }

  const text = extracted.value ?? ''
  return {
    text,
    pages: [{ index: 0, text }],
    latency_ms: Date.now() - t0,
  }
}
