/**
 * RAM-based OCR tier auto-selection (lean rebuild — D35).
 *
 * Picks the right PaddleOCR-VL quantization based on total system RAM:
 *
 *   ≥ 12 GiB binary  → bf16   (covers 16 GB Macs, ample headroom for unified memory)
 *   ≥  6 GiB binary  → 8-bit  (covers 8 GB Macs)
 *   <  6 GiB binary  → 4-bit  (rare; only old Intel Macs)
 *
 * The thresholds are 75 % of the marketing-GB equivalent so we don't get
 * tripped up by tiny variations in `os.totalmem()` reporting.
 *
 * Override paths (in priority order):
 *   1. CELLSENTRY_OCR_TIER env var (`bf16` | `8bit` | `4bit` | `ds-ocr-2`)
 *   2. RAM-based auto-selection (default)
 *
 * Day 6 polish wires a Settings UI option that writes the env var so the
 * choice persists across restarts.
 */

import { totalmem } from 'os'

import {
  PADDLEOCR_VL_BF16,
  PADDLEOCR_VL_8BIT,
  PADDLEOCR_VL_4BIT,
  DEEPSEEK_OCR_2_8BIT,
} from './registry'
import type { DirectoryModel } from './downloader'

const GIB = 1024 * 1024 * 1024
const BF16_THRESHOLD = 12 * GIB
const Q8_THRESHOLD = 6 * GIB

export type OcrTier = 'bf16' | '8bit' | '4bit' | 'ds-ocr-2'

const TIER_TO_MODEL: Record<OcrTier, DirectoryModel> = {
  bf16: PADDLEOCR_VL_BF16,
  '8bit': PADDLEOCR_VL_8BIT,
  '4bit': PADDLEOCR_VL_4BIT,
  'ds-ocr-2': DEEPSEEK_OCR_2_8BIT,
}

function readOverride(): OcrTier | null {
  const raw = process.env.CELLSENTRY_OCR_TIER
  if (raw === 'bf16' || raw === '8bit' || raw === '4bit' || raw === 'ds-ocr-2') {
    return raw
  }
  return null
}

export function autoTierFromRam(totalBytes: number): OcrTier {
  if (totalBytes >= BF16_THRESHOLD) return 'bf16'
  if (totalBytes >= Q8_THRESHOLD) return '8bit'
  return '4bit'
}

/** Returns the active OCR tier (override > RAM-based auto-select). */
export function selectOcrTier(): OcrTier {
  const override = readOverride()
  if (override) return override
  return autoTierFromRam(totalmem())
}

/** Returns the active OCR DirectoryModel — used by ModelDownloader + engine. */
export function selectOcrModel(): DirectoryModel {
  return TIER_TO_MODEL[selectOcrTier()]
}
