/**
 * Typed registry of v2.0 models — single source of truth for what
 * ModelDownloader can fetch.
 *
 * v1.x DEFAULT_MODEL (`cellsentry-1.5b-v3-q4km.gguf`) was deleted in this
 * refactor (W1 Step 1.3 / AD10). v2 entries below replace it.
 *
 * IMPORTANT — file lists below are EMPTY (`files: []`) until W2 Step 2.0
 * (AD9 go/no-go gate) verifies upstream availability on ModelScope and
 * collects real per-file sha256 + size data. Don't fill these in here
 * until that smoke test passes; otherwise we risk shipping wrong sha256
 * and silently corrupting downloads.
 *
 * What "empty files" means for the downloader:
 *   - `aggregateSize` is 0
 *   - `checkModelExists` returns true vacuously (nothing required)
 *   - `download` is a no-op success
 * This lets the app launch in W1 without bringing the user through a
 * download flow that has no real data behind it. W2 swaps these in.
 */

import type { DirectoryModel } from './downloader'

// ---------------------------------------------------------------------------
// OCR — DeepSeek-OCR via mlx_vlm. Direct-pulled from upstream (no rehost).
// AD9: hf-mirror is community-maintained; MS mirror needs W2 verification.
// ---------------------------------------------------------------------------

export const OCR_MODEL_V2: DirectoryModel = {
  kind: 'directory',
  name: 'CellSentry v2 OCR (DeepSeek-OCR 8-bit)',
  version: 'v2.0',
  description:
    'DeepSeek-OCR (MIT) MLX 8-bit quantization. Used for image / scanned-PDF text extraction. ' +
    'Mac-only for v2.0-beta.1 (AD7); Windows skips OCR.',
  localDirName: 'deepseek-ocr-8bit',
  files: [], // TODO: W2 Step 2.0 — fill from `huggingface.co/api/models/.../tree/main`
  aggregateSize: 0,
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/DeepSeek-OCR-8bit/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/DeepSeek-OCR-8bit/resolve/main',
    // MS path subject to AD9 W2 smoke test; fall back to plan B (rehost) if missing.
    ms: 'https://modelscope.cn/models/mlx-community/DeepSeek-OCR-8bit/resolve/master',
  },
}

// ---------------------------------------------------------------------------
// Safety-net LLM — Qwen2.5-3B-Instruct-4bit. Rehosted on cellsentry-model v2.0.
// AD9: small enough (~1.8 GB) that "we verify + distribute" branding is worth
// the LFS cost; gives a single source of truth if upstream Qwen weights move.
// ---------------------------------------------------------------------------

export const SAFETYNET_MODEL_V2: DirectoryModel = {
  kind: 'directory',
  name: 'CellSentry v2 Safety-Net (Qwen2.5-3B-Instruct 4-bit)',
  version: 'v2.0',
  description:
    'Qwen2.5-3B-Instruct (Apache 2.0) MLX 4-bit. Reads redacted output and flags ' +
    'human names that look like real people but were missed by the user mapping. ' +
    'Last line of defense, not the primary detector. Mac-only for v2.0-beta.1.',
  localDirName: 'safetynet-qwen2.5-3b-mlx-4bit',
  files: [], // TODO: W2 Step 5.3 — fill once weights are uploaded under v2.0 tag
  aggregateSize: 0,
  baseUrls: {
    hf: 'https://huggingface.co/almax000/cellsentry-model/resolve/v2.0',
    mirror: 'https://hf-mirror.com/almax000/cellsentry-model/resolve/v2.0',
    ms: 'https://modelscope.cn/models/almax000/cellsentry-model/resolve/v2.0',
  },
}

/** All v2 models the app needs to download. Order matters: OCR first (~6 GB), safety-net second. */
export const V2_MODELS: readonly DirectoryModel[] = [OCR_MODEL_V2, SAFETYNET_MODEL_V2]
