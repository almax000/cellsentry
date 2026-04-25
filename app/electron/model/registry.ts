/**
 * Typed registry of v2.0 models — single source of truth for what
 * ModelDownloader can fetch.
 *
 * v1.x DEFAULT_MODEL (`cellsentry-1.5b-v3-q4km.gguf`) was deleted in this
 * refactor (W1 Step 1.3 / AD10). v2 entries below replace it.
 *
 * File lists + sha256s populated W2 Step 2.0 from verified HF tree listings
 * + LFS metadata. See `_inbox/v2-hosting-decision.md` for the AD9 outcome
 * that locked plan A (direct upstream pull, no rehost on cellsentry-model).
 *
 * Sha256 strategy:
 *   - Big LFS files (`model.safetensors`): real sha256 from HF `lfs.oid`.
 *   - Inline files (config / tokenizer / etc.): empty string → downloader's
 *     `verifyChecksumSync` short-circuits true. HF API exposes only the
 *     git-blob sha-1 for inline files which isn't usable as a sha256.
 *     Risk is bounded — inline files are < 100 KB each (~10 MB total across
 *     both models) and corruption surfaces immediately (config.json fails
 *     to parse, tokenizer.json fails to load). High-assurance variant is
 *     "fetch once, compute, store" — deferred to v2.0.0 stable if needed.
 */

import type { DirectoryModel } from './downloader'

// ---------------------------------------------------------------------------
// OCR — DeepSeek-OCR via mlx_vlm. Direct upstream pull (no rehost per AD9 plan A).
// MS mirror uploaded by `Cherrytest` 2026-04-20; HF authoritative.
// ---------------------------------------------------------------------------

export const OCR_MODEL_V2: DirectoryModel = {
  kind: 'directory',
  name: 'CellSentry v2 OCR (DeepSeek-OCR 8-bit)',
  version: 'v2.0',
  description:
    'DeepSeek-OCR (MIT) MLX 8-bit quantization. Used for image / scanned-PDF text extraction. ' +
    'Mac-only for v2.0-beta.1 (AD7); Windows skips OCR.',
  localDirName: 'deepseek-ocr-8bit',
  files: [
    { path: '.gitattributes', size: 1519, sha256: '' },
    { path: 'README.md', size: 653, sha256: '' },
    { path: 'chat_template.jinja', size: 191, sha256: '' },
    { path: 'chat_template.json', size: 217, sha256: '' },
    { path: 'config.json', size: 3398, sha256: '' },
    { path: 'configuration_deepseek_v2.py', size: 10646, sha256: '' },
    { path: 'conversation.py', size: 9253, sha256: '' },
    { path: 'deepencoder.py', size: 38008, sha256: '' },
    {
      path: 'model.safetensors',
      size: 3919426465,
      sha256: 'fb3cf7b019cedc21ab22ac08fd9e83d4fffa92d3581d73b47e6d0ee5bf308aa0',
    },
    { path: 'model.safetensors.index.json', size: 72573, sha256: '' },
    { path: 'modeling_deepseekocr.py', size: 40133, sha256: '' },
    { path: 'modeling_deepseekv2.py', size: 82224, sha256: '' },
    { path: 'processor_config.json', size: 460, sha256: '' },
    { path: 'special_tokens_map.json', size: 801, sha256: '' },
    { path: 'tokenizer.json', size: 9979544, sha256: '' },
    { path: 'tokenizer_config.json', size: 577, sha256: '' },
  ],
  aggregateSize: 3_929_666_662, // 3.93 GB
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/DeepSeek-OCR-8bit/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/DeepSeek-OCR-8bit/resolve/main',
    ms: 'https://modelscope.cn/models/mlx-community/DeepSeek-OCR-8bit/resolve/master',
  },
}

// ---------------------------------------------------------------------------
// Safety-net LLM — Qwen2.5-3B-Instruct-4bit. Direct upstream pull
// (plan v3 originally proposed rehost on `cellsentry-model v2.0`; AD9 W2
// probe found the upstream is on MS too, so rehost work is deferred to
// v2.0.0 stable. See `_inbox/v2-hosting-decision.md`.)
// ---------------------------------------------------------------------------

export const SAFETYNET_MODEL_V2: DirectoryModel = {
  kind: 'directory',
  name: 'CellSentry v2 Safety-Net (Qwen2.5-3B-Instruct 4-bit)',
  version: 'v2.0',
  description:
    'Qwen2.5-3B-Instruct (Apache 2.0) MLX 4-bit. Reads redacted output and flags ' +
    'human names that look like real people but were missed by the user mapping. ' +
    'Last line of defense, not the primary detector. Mac-only for v2.0-beta.1.',
  localDirName: 'qwen2.5-3b-instruct-4bit',
  files: [
    { path: '.gitattributes', size: 1519, sha256: '' },
    { path: 'README.md', size: 755, sha256: '' },
    { path: 'added_tokens.json', size: 605, sha256: '' },
    { path: 'config.json', size: 785, sha256: '' },
    { path: 'merges.txt', size: 1671853, sha256: '' },
    {
      path: 'model.safetensors',
      size: 1736293090,
      sha256: 'f212cf6fb9923281a09c135e05d43a052ee5ef7121f5b1dc0b0fb2de80f97cfd',
    },
    { path: 'model.safetensors.index.json', size: 66290, sha256: '' },
    { path: 'special_tokens_map.json', size: 613, sha256: '' },
    { path: 'tokenizer.json', size: 7031673, sha256: '' },
    { path: 'tokenizer_config.json', size: 7308, sha256: '' },
    { path: 'vocab.json', size: 2776833, sha256: '' },
  ],
  aggregateSize: 1_747_851_324, // 1.75 GB
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/Qwen2.5-3B-Instruct-4bit/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/Qwen2.5-3B-Instruct-4bit/resolve/main',
    ms: 'https://modelscope.cn/models/mlx-community/Qwen2.5-3B-Instruct-4bit/resolve/master',
  },
}

/** All v2 models the app needs to download. Order matters: OCR first (~3.93 GB), safety-net second (~1.75 GB). */
export const V2_MODELS: readonly DirectoryModel[] = [OCR_MODEL_V2, SAFETYNET_MODEL_V2]
