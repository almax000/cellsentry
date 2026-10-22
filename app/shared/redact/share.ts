/**
 * Build the shareable text: every chosen candidate replaced by its code, files
 * labelled by number only (a file name can itself be personal). The output
 * remembers where each code and each kept value sits, and which source text
 * every other stretch came from, so the leftover check can point back at the
 * exact spot in the original.
 */
import type { Candidate, CodeLocale, SourceDocument } from './types'

export interface CodeSpan {
  start: number
  end: number
  code: string
  candidateId: string
}

/** A value the user explicitly chose to keep or marked as not personal. */
export interface KeptSpan {
  start: number
  end: number
  candidateId: string
}

/** A stretch of output copied unchanged from a page. */
export interface SourcePiece {
  start: number
  end: number
  docId: string
  page: number
  sourceStart: number
}

export interface PageOutput {
  docId: string
  page: number
  text: string
  /** Where each code sits in `text`, for highlighting. */
  spans: CodeSpan[]
  kept: KeptSpan[]
  pieces: SourcePiece[]
}

/**
 * Replace chosen candidates on every page. Candidates without a code are left
 * as they are; only those in `explicit` (the user decided) are recorded as
 * kept, so a default "keep" is still checked for leftovers.
 */
export function applyCodes(docs: SourceDocument[], candidates: Candidate[], codeFor: Record<string, string>,
  explicit: ReadonlySet<string> = new Set()): PageOutput[] {
  const outputs: PageOutput[] = []
  for (const doc of docs) {
    for (const page of doc.pages) {
      const onPage = candidates
        .filter((candidate) => candidate.docId === doc.id && candidate.page === page.page)
        .sort((a, b) => a.start - b.start)
      let text = ''
      let cursor = 0
      const spans: CodeSpan[] = []
      const kept: KeptSpan[] = []
      const pieces: SourcePiece[] = []
      const copy = (until: number): void => {
        if (until <= cursor) return
        pieces.push({ start: text.length, end: text.length + (until - cursor), docId: doc.id, page: page.page, sourceStart: cursor })
        text += page.text.slice(cursor, until)
        cursor = until
      }
      for (const candidate of onPage) {
        if (candidate.start < cursor) continue
        const code = codeFor[candidate.id]
        if (!code) {
          if (explicit.has(candidate.id)) {
            kept.push({ start: text.length + (candidate.start - cursor), end: text.length + (candidate.end - cursor), candidateId: candidate.id })
          }
          continue
        }
        copy(candidate.start)
        spans.push({ start: text.length, end: text.length + code.length, code, candidateId: candidate.id })
        text += code
        cursor = candidate.end
      }
      copy(page.text.length)
      outputs.push({ docId: doc.id, page: page.page, text, spans, kept, pieces })
    }
  }
  return outputs
}

export interface ShareText {
  text: string
  spans: CodeSpan[]
  kept: KeptSpan[]
  pieces: SourcePiece[]
}

function header(locale: CodeLocale, fileNumber: number, page: number, pageCount: number): string {
  if (locale === 'zh') return pageCount > 1 ? `【文件 ${fileNumber} \u00b7 第 ${page} 页】` : `【文件 ${fileNumber}】`
  return pageCount > 1 ? `[File ${fileNumber} \u00b7 page ${page}]` : `[File ${fileNumber}]`
}

export function buildShareText(docs: SourceDocument[], outputs: PageOutput[], locale: CodeLocale): ShareText {
  let text = ''
  const spans: CodeSpan[] = []
  const kept: KeptSpan[] = []
  const pieces: SourcePiece[] = []
  docs.forEach((doc, index) => {
    for (const page of doc.pages) {
      const output = outputs.find((item) => item.docId === doc.id && item.page === page.page)
      if (!output) continue
      if (text) text += '\n\n'
      text += `${header(locale, index + 1, page.page, doc.pages.length)}\n`
      const offset = text.length
      text += output.text
      for (const span of output.spans) spans.push({ ...span, start: span.start + offset, end: span.end + offset })
      for (const span of output.kept) kept.push({ ...span, start: span.start + offset, end: span.end + offset })
      for (const piece of output.pieces) pieces.push({ ...piece, start: piece.start + offset, end: piece.end + offset })
    }
  })
  return { text, spans, kept, pieces }
}

/** Where a stretch of the shareable text came from, if it lies inside one unchanged piece. */
export function sourceOf(share: ShareText, start: number, end: number): { docId: string; page: number; start: number; end: number } | null {
  const piece = share.pieces.find((item) => item.start <= start && end <= item.end)
  if (!piece) return null
  return { docId: piece.docId, page: piece.page, start: piece.sourceStart + (start - piece.start), end: piece.sourceStart + (end - piece.start) }
}
