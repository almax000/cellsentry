/**
 * Typed registry of v2 OCR models — single source of truth for what
 * ModelDownloader can fetch.
 *
 * Lean rebuild (D35): PaddleOCR-VL-1.5 replaces DeepSeek-OCR as the primary
 * engine. Three quantization tiers (bf16 / 8bit / 4bit) — Day 5 wires the
 * RAM-based auto-selection. DeepSeek-OCR-2-8bit kept as a settings-switchable
 * fallback (per ADR § 6.4 — flip the default engine via patch release if
 * dogfood gate fails on PaddleOCR-VL).
 *
 * REVOKED in lean rebuild: SAFETYNET_MODEL_V2 (Qwen2.5-3B-Instruct-4bit).
 *
 * Sha256 strategy:
 *   - LFS files (model.safetensors, tokenizer.json): real sha256 from HF lfs.oid.
 *   - Inline files (config / tokenizer-config / etc.): empty string → downloader's
 *     verifyChecksumSync short-circuits true. HF API only exposes git-blob sha-1
 *     for inline files which isn't usable as a sha256. Risk is bounded — inline
 *     files are < 100 KB each (~12 MB total) and corruption surfaces immediately
 *     (config.json fails to parse, tokenizer.json fails to load).
 */

import type { DirectoryModel } from './downloader'

// ---------------------------------------------------------------------------
// PaddleOCR-VL-1.5 — primary OCR engine, 3 quantization tiers
// (Day 5 picks per RAM: ≥16GB → bf16, 8-16GB → 8bit, <8GB → 4bit)
// ---------------------------------------------------------------------------

export const PADDLEOCR_VL_BF16: DirectoryModel = {
  kind: 'directory',
  name: 'PaddleOCR-VL 1.5 (bf16)',
  version: 'v1.5',
  description:
    'PaddleOCR-VL 1.5 (Apache 2.0) MLX bf16. Primary OCR engine for ≥16 GB RAM machines. ' +
    'Used for image / scanned-PDF text extraction. Mac-only for v2.0-beta (AD7).',
  localDirName: 'paddleocr-vl-1.5-bf16',
  files: [
    { path: '.gitattributes', size: 1570, sha256: '' },
    { path: 'README.md', size: 802, sha256: '' },
    { path: 'added_tokens.json', size: 25381, sha256: '' },
    { path: 'chat_template.jinja', size: 1474, sha256: '' },
    { path: 'config.json', size: 2278, sha256: '' },
    { path: 'configuration_paddleocr_vl.py', size: 8104, sha256: '' },
    { path: 'generation_config.json', size: 133, sha256: '' },
    { path: 'image_processing_paddleocr_vl.py', size: 24966, sha256: '' },
    {
      path: 'model.safetensors',
      size: 1811260812,
      sha256: 'f566d7dfe2c79f2e38ad290bf9f79fc57b46da433eb44ed4de70eb767eb8d9aa',
    },
    { path: 'model.safetensors.index.json', size: 36584, sha256: '' },
    { path: 'modeling_paddleocr_vl.py', size: 111490, sha256: '' },
    { path: 'preprocessor_config.json', size: 641, sha256: '' },
    { path: 'processing_paddleocr_vl.py', size: 12253, sha256: '' },
    { path: 'processor_config.json', size: 843, sha256: '' },
    { path: 'special_tokens_map.json', size: 1151, sha256: '' },
    {
      path: 'tokenizer.json',
      size: 11189060,
      sha256: 'c8a215a59183d0d0781adc33bacd3ce6162716f7fd568fb30234a74d69803a7d',
    },
    { path: 'tokenizer_config.json', size: 876, sha256: '' },
  ],
  aggregateSize: 1_822_678_418, // 1.82 GB
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/PaddleOCR-VL-1.5-bf16/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/PaddleOCR-VL-1.5-bf16/resolve/main',
    ms: 'https://modelscope.cn/models/mlx-community/PaddleOCR-VL-1.5-bf16/resolve/master',
  },
}

export const PADDLEOCR_VL_8BIT: DirectoryModel = {
  kind: 'directory',
  name: 'PaddleOCR-VL 1.5 (8-bit)',
  version: 'v1.5',
  description:
    'PaddleOCR-VL 1.5 (Apache 2.0) MLX 8-bit. Primary OCR engine for 8-16 GB RAM machines.',
  localDirName: 'paddleocr-vl-1.5-8bit',
  files: [
    { path: '.gitattributes', size: 1570, sha256: '' },
    { path: 'README.md', size: 802, sha256: '' },
    { path: 'added_tokens.json', size: 25381, sha256: '' },
    { path: 'chat_template.jinja', size: 1474, sha256: '' },
    { path: 'config.json', size: 2483, sha256: '' },
    { path: 'configuration_paddleocr_vl.py', size: 8104, sha256: '' },
    { path: 'generation_config.json', size: 133, sha256: '' },
    { path: 'image_processing_paddleocr_vl.py', size: 24966, sha256: '' },
    {
      path: 'model.safetensors',
      size: 1088866628,
      sha256: 'f8722b9e3701d2ba74774cc444c2d25dbb569ee5f9ab9ac39d4229cfe376472c',
    },
    { path: 'model.safetensors.index.json', size: 69880, sha256: '' },
    { path: 'modeling_paddleocr_vl.py', size: 111490, sha256: '' },
    { path: 'preprocessor_config.json', size: 641, sha256: '' },
    { path: 'processing_paddleocr_vl.py', size: 12253, sha256: '' },
    { path: 'processor_config.json', size: 843, sha256: '' },
    { path: 'special_tokens_map.json', size: 1151, sha256: '' },
    {
      path: 'tokenizer.json',
      size: 11189060,
      sha256: 'c8a215a59183d0d0781adc33bacd3ce6162716f7fd568fb30234a74d69803a7d',
    },
    { path: 'tokenizer_config.json', size: 876, sha256: '' },
  ],
  aggregateSize: 1_100_317_735, // 1.10 GB
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/PaddleOCR-VL-1.5-8bit/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/PaddleOCR-VL-1.5-8bit/resolve/main',
    ms: 'https://modelscope.cn/models/mlx-community/PaddleOCR-VL-1.5-8bit/resolve/master',
  },
}

export const PADDLEOCR_VL_4BIT: DirectoryModel = {
  kind: 'directory',
  name: 'PaddleOCR-VL 1.5 (4-bit)',
  version: 'v1.5',
  description:
    'PaddleOCR-VL 1.5 (Apache 2.0) MLX 4-bit. Primary OCR engine for <8 GB RAM machines.',
  localDirName: 'paddleocr-vl-1.5-4bit',
  files: [
    { path: '.gitattributes', size: 1570, sha256: '' },
    { path: 'README.md', size: 802, sha256: '' },
    { path: 'added_tokens.json', size: 25381, sha256: '' },
    { path: 'chat_template.jinja', size: 1474, sha256: '' },
    { path: 'config.json', size: 2483, sha256: '' },
    { path: 'configuration_paddleocr_vl.py', size: 8104, sha256: '' },
    { path: 'generation_config.json', size: 133, sha256: '' },
    { path: 'image_processing_paddleocr_vl.py', size: 24966, sha256: '' },
    {
      path: 'model.safetensors',
      size: 703562711,
      sha256: 'f9a45393e2ffe6cbb412c25c82704fbb081e952c4c4517fa01e8a750010d1267',
    },
    { path: 'model.safetensors.index.json', size: 69879, sha256: '' },
    { path: 'modeling_paddleocr_vl.py', size: 111490, sha256: '' },
    { path: 'preprocessor_config.json', size: 641, sha256: '' },
    { path: 'processing_paddleocr_vl.py', size: 12253, sha256: '' },
    { path: 'processor_config.json', size: 843, sha256: '' },
    { path: 'special_tokens_map.json', size: 1151, sha256: '' },
    {
      path: 'tokenizer.json',
      size: 11189060,
      sha256: 'c8a215a59183d0d0781adc33bacd3ce6162716f7fd568fb30234a74d69803a7d',
    },
    { path: 'tokenizer_config.json', size: 876, sha256: '' },
  ],
  aggregateSize: 715_013_817, // 0.72 GB
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/PaddleOCR-VL-1.5-4bit/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/PaddleOCR-VL-1.5-4bit/resolve/main',
    ms: 'https://modelscope.cn/models/mlx-community/PaddleOCR-VL-1.5-4bit/resolve/master',
  },
}

// ---------------------------------------------------------------------------
// DeepSeek-OCR-2-8bit — settings-switchable fallback (D35 ADR § 6.4)
// Used when dogfood gate fails on PaddleOCR-VL or the user manually switches.
// ---------------------------------------------------------------------------

export const DEEPSEEK_OCR_2_8BIT: DirectoryModel = {
  kind: 'directory',
  name: 'DeepSeek-OCR 2 (8-bit, fallback)',
  version: 'v2.0',
  description:
    'DeepSeek-OCR-2 (MIT) MLX 8-bit. Fallback OCR engine — used only when ' +
    'PaddleOCR-VL fails to satisfy the dogfood quality gate or the user manually ' +
    'switches in Settings.',
  localDirName: 'deepseek-ocr-2-8bit',
  files: [
    { path: '.gitattributes', size: 1519, sha256: '' },
    { path: 'README.md', size: 668, sha256: '' },
    { path: 'chat_template.jinja', size: 191, sha256: '' },
    { path: 'config.json', size: 3272, sha256: '' },
    { path: 'configuration_deepseek_v2.py', size: 10646, sha256: '' },
    { path: 'conversation.py', size: 9253, sha256: '' },
    { path: 'deepencoderv2.py', size: 36299, sha256: '' },
    {
      path: 'model.safetensors',
      size: 4026836549,
      sha256: '2907b8f0bfe66fe334b13829f5d5cc458433f61d441c6ea9dbd5760b2fd06fe0',
    },
    { path: 'model.safetensors.index.json', size: 74152, sha256: '' },
    { path: 'modeling_deepseekocr2.py', size: 39226, sha256: '' },
    { path: 'modeling_deepseekv2.py', size: 82224, sha256: '' },
    { path: 'processor_config.json', size: 460, sha256: '' },
    { path: 'special_tokens_map.json', size: 801, sha256: '' },
    { path: 'tokenizer.json', size: 9979544, sha256: '' },
    { path: 'tokenizer_config.json', size: 577, sha256: '' },
  ],
  aggregateSize: 4_037_075_381, // 4.04 GB
  baseUrls: {
    hf: 'https://huggingface.co/mlx-community/DeepSeek-OCR-2-8bit/resolve/main',
    mirror: 'https://hf-mirror.com/mlx-community/DeepSeek-OCR-2-8bit/resolve/main',
    ms: 'https://modelscope.cn/models/mlx-community/DeepSeek-OCR-2-8bit/resolve/master',
  },
}

// ---------------------------------------------------------------------------
// Default OCR model — Day 5 will replace with RAM-based tier selection.
// For Day 2 we hardcode bf16 as the default; the existing ipc.ts getDownloader
// flow keeps working with `OCR_MODEL_V2` as the import name.
// ---------------------------------------------------------------------------

export const OCR_MODEL_V2: DirectoryModel = PADDLEOCR_VL_BF16

/** All v2 models the app may need to download (default tier picked at runtime). */
export const V2_MODELS: readonly DirectoryModel[] = [OCR_MODEL_V2]

/** All possible OCR variants — used by the Settings panel + Day 5 RAM-tier selection. */
export const OCR_VARIANTS: readonly DirectoryModel[] = [
  PADDLEOCR_VL_BF16,
  PADDLEOCR_VL_8BIT,
  PADDLEOCR_VL_4BIT,
  DEEPSEEK_OCR_2_8BIT,
]
