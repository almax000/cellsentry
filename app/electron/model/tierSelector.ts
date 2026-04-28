/**
 * OCR tier selection (lean rebuild — D35 + 2026-04-28 audit).
 *
 * Default = 'disabled'. v2.0 ships without OCR by default because:
 *   - Modern Chinese hospital records are digital PDFs / DOCX (D34 stack
 *     handles those without OCR)
 *   - For image inputs, system OCR (macOS Live Text / Windows OCR API) is
 *     local, free, and on par with our engine for standard printed Chinese
 *   - Saves the 1.82 GB PaddleOCR-VL download on first-launch UX
 *
 * Override paths (in priority order):
 *   1. CELLSENTRY_OCR_TIER env var (`bf16` | `8bit` | `4bit` | `ds-ocr-2`)
 *   2. Default: 'disabled' (no model download, image input shows hint)
 *
 * If user opts in via env var, the matching DirectoryModel is returned and
 * the main process triggers the download flow on next launch.
 *
 * Day 8+ may add a Settings UI toggle that writes the env var so the choice
 * persists. Until then, OCR is power-user / DrCrow-demo only.
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

export type OcrTier = 'disabled' | 'bf16' | '8bit' | '4bit' | 'ds-ocr-2'

const TIER_TO_MODEL: Record<Exclude<OcrTier, 'disabled'>, DirectoryModel> = {
  bf16: PADDLEOCR_VL_BF16,
  '8bit': PADDLEOCR_VL_8BIT,
  '4bit': PADDLEOCR_VL_4BIT,
  'ds-ocr-2': DEEPSEEK_OCR_2_8BIT,
}

function readOverride(): OcrTier | null {
  const raw = process.env.CELLSENTRY_OCR_TIER
  if (
    raw === 'disabled' ||
    raw === 'bf16' ||
    raw === '8bit' ||
    raw === '4bit' ||
    raw === 'ds-ocr-2'
  ) {
    return raw
  }
  return null
}

/** Pure RAM-to-tier mapping. Used when user opts in but doesn't pick a tier
 *  explicitly — picks the right PaddleOCR-VL quantization for their machine. */
export function autoTierFromRam(totalBytes: number): Exclude<OcrTier, 'disabled' | 'ds-ocr-2'> {
  if (totalBytes >= BF16_THRESHOLD) return 'bf16'
  if (totalBytes >= Q8_THRESHOLD) return '8bit'
  return '4bit'
}

/** Returns the active OCR tier. Default 'disabled'; env override switches on. */
export function selectOcrTier(): OcrTier {
  const override = readOverride()
  if (override === 'disabled') return 'disabled'
  if (override) return override
  // Default: OCR off. User must opt in via CELLSENTRY_OCR_TIER.
  return 'disabled'
}

/** Returns the active OCR DirectoryModel, or null when OCR is disabled. */
export function selectOcrModel(): DirectoryModel | null {
  const tier = selectOcrTier()
  if (tier === 'disabled') return null
  return TIER_TO_MODEL[tier]
}

/** True when the user has opted into image OCR. */
export function isOcrEnabled(): boolean {
  return selectOcrTier() !== 'disabled'
}
