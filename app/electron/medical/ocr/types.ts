/**
 * OCR-specific types. Re-exports from medical/types.ts for ergonomics.
 */

export type { OcrPage, OcrResult, OcrError } from '../types'

export interface OcrRequest {
  /** Either base64-encoded bytes (`data:image/...;base64,...`) or absolute file path. */
  source: { kind: 'path'; path: string } | { kind: 'base64'; data: string; mime: string }
  /** Optional rendering hint for multi-page PDFs (image-mode pages). */
  page_index?: number
}
