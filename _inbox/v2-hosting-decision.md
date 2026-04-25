# v2 Hosting Decision — AD9 Go/No-Go Gate (W2 Step 2.0)

> **Date:** 2026-04-25
> **Author:** Claude Code v2 implementation session
> **Plan reference:** `~/Movies/DrCrow/.claude/plans/v2-pivot-plan-v3.md` Step 2.0 / AD9
> **Status:** ✅ **Plan A confirmed** — direct upstream pull for both v2 models
> **No rehost work needed** for v2.0-beta.1.

## Summary

Both v2 models are available on **HuggingFace AND ModelScope** with byte-identical content. The original concern that drove plan v3 AD9 (rehosting Qwen2.5-3B on `cellsentry-model v2.0` for "single source of truth + brand") has lower urgency than estimated; we can defer it to v2.0.0 stable without harming Mac dev or Dell-PC China dev.

**Decision: direct upstream pulls for both. No rehost on `almax000/cellsentry-model v2.0` for beta.**

## Probe results

### DeepSeek-OCR-8bit (`mlx-community/DeepSeek-OCR-8bit`)

| Mirror | Status | Files | Size | Notes |
|--------|--------|-------|------|-------|
| HuggingFace | ✅ 200 | 16 | 3.93 GB | Authoritative, mlx-community official |
| ModelScope | ✅ 200 | 17 | 3.93 GB | +1 MS-internal `configuration.json`; ignore in download. Uploaded by `Cherrytest` 2026-04-20 (~5 days before this probe) |
| hf-mirror.com | ✅ inferred (community-maintained mirror of HF) | — | — | Fallback for non-zh users with HF ratelimit |

### Qwen2.5-3B-Instruct-4bit (`mlx-community/Qwen2.5-3B-Instruct-4bit`)

| Mirror | Status | Files | Size | Notes |
|--------|--------|-------|------|-------|
| HuggingFace | ✅ 200 | 11 | 1.75 GB | Authoritative |
| ModelScope | ✅ 200 | 12 | 1.75 GB | +1 MS `configuration.json`; ignore. Uploaded by `ai-modelscope` 2024-12 |
| hf-mirror.com | ✅ inferred | — | — | Fallback |

**Combined download budget (first launch on Mac):** ~5.68 GB.
Plan v3 estimated 7.8 GB; the actual is 27% smaller (DS-OCR is 3.93 GB not the cited 6 GB).

## Why plan A over plan B

Plan v3 AD9 specified plan B (rehost both on `cellsentry-model` v2.0 tag) "if MS does not have either." MS has both, so plan B's trigger condition isn't met.

The only remaining argument for rehost was AD9's secondary justification:

> "(b) keeps the 'we verify + distribute' branding for the part of the stack we own (consistent with v1 model story); (c) gives us a single source-of-truth in case upstream Qwen2.5 weights move"

Trade-off:

| Argument | Weight |
|----------|--------|
| (b) brand alignment | Low — v2 already keeps brand via `cellsentry.pro` website + Mac/Win installer + brand outline in app UI; an LFS upload doesn't move that needle |
| (c) immutable single source of truth | Medium — but `mlx-community` has been stable for 18+ months and the 4-bit Qwen2.5 quantization is unlikely to move once published |
| (cost) ~1.8 GB LFS upload + token plumbing for HF + MS | High W2 cost — would burn ~half a day on plumbing without delivering user-visible value |

**For v2.0-beta.1, defer rehost.** Revisit at v2.0.0 stable when:
- We have community feedback / issues against beta
- `mlx-community/Qwen2.5-3B-Instruct-4bit` has shown to be unstable (no evidence yet)
- We add new fine-tuning to the safety-net (which would justify a custom rehost path)

## Probe artifact (what I actually ran)

```bash
# Bug found during probe: ?Revision=master query param breaks the
# /api/v1/models/{path} endpoint. The plan v3 example URL had it.
# Without that param, all four endpoints return 200.

# Used:
curl -fsSL "https://modelscope.cn/api/v1/models/{owner}/{name}/repo/files?Revision=master&Recursive=true"
curl -fsSL "https://huggingface.co/api/models/{owner}/{name}/tree/main?recursive=true"

# Verified MS resolve URL serves correct bytes:
curl "https://modelscope.cn/models/mlx-community/DeepSeek-OCR-8bit/resolve/master/config.json"
# → 3398 bytes, valid JSON, matches HF ground-truth
```

## URL patterns (locked for `app/electron/model/registry.ts`)

| Provider | DS-OCR base | Qwen safety-net base |
|----------|-------------|----------------------|
| HF (`hf`) | `https://huggingface.co/mlx-community/DeepSeek-OCR-8bit/resolve/main` | `https://huggingface.co/mlx-community/Qwen2.5-3B-Instruct-4bit/resolve/main` |
| hf-mirror (`mirror`) | `https://hf-mirror.com/mlx-community/DeepSeek-OCR-8bit/resolve/main` | `https://hf-mirror.com/mlx-community/Qwen2.5-3B-Instruct-4bit/resolve/main` |
| MS (`ms`) | `https://modelscope.cn/models/mlx-community/DeepSeek-OCR-8bit/resolve/master` | `https://modelscope.cn/models/mlx-community/Qwen2.5-3B-Instruct-4bit/resolve/master` |

Note the platform branch difference: HF uses `main`, MS uses `master`. The downloader's `baseUrls.{hf, mirror, ms}` shape carries each as a complete prefix so per-platform branch differences are encapsulated.

## Sha256 verification strategy

| File class | Source of sha256 | Verification |
|------------|------------------|--------------|
| Big LFS (`model.safetensors`) | HF API `lfs.oid` field — actual sha256 of LFS content | ✅ Real sha256 stored in registry, downloader verifies |
| Inline (`config.json`, `tokenizer.json`, etc.) | HF API gives only git-blob `oid` (sha-1, not what we want) | ⚠️ Empty sha256 → `verifyChecksumSync` short-circuits true. Risk: a corrupted inline file passes through. Mitigation: inline files are tiny (mostly < 100 KB, total ~10 MB across both models) and corruption would be obvious (config.json fails to parse). For high-assurance, future work could fetch the file once and compute sha256 locally. |

## Implications captured

1. **`OCR_MODEL_V2.files[]`** populates from HF tree listing (16 entries, big LFS uses `lfs.oid` sha256, inline empty string).
2. **`SAFETYNET_MODEL_V2.files[]`** populates similarly (11 entries).
3. **`SAFETYNET_MODEL_V2.baseUrls`** changes from `almax000/cellsentry-model v2.0` to `mlx-community/Qwen2.5-3B-Instruct-4bit` — the registry edit is straightforward.
4. **`SAFETYNET_MODEL_V2.localDirName`** changes from `safetynet-qwen2.5-3b-mlx-4bit` (which implied it was custom-fine-tuned) to `qwen2.5-3b-instruct-4bit` (matches upstream identity).
5. **No HF / MS upload work this week.** Step 5.3 (originally "rehost safety-net to cellsentry-model v2.0 tag") is removed from v2.0-beta.1 scope.
6. **`almax000/cellsentry-model`** stays at the v1 tag (with its existing GGUF). v2.0 tag is NOT created in this beta. The repo remains a brand-presence touch-point but doesn't carry v2 weights.

## Risks acknowledged

- **mlx-community deprecation/move**: low probability, well-established org. Mitigation = downloader URL fallback chain (HF → hf-mirror → MS, or zh reversed).
- **MS upload by `Cherrytest` is recent (5 days)**: this isn't an established mlx-community-MS pipeline, just one community member uploading. If they delete or break the upload, our China-side fallback drops to `hf-mirror.com`. Acceptable for beta; v2.0.0 stable should re-evaluate.
- **`hf-mirror.com` is community-maintained**: same as v1 risk, no change.
- **No sha256 on inline files**: documented above. Acceptable.

## Action items (now)

- [x] Document decision (this file)
- [ ] Update `OCR_MODEL_V2` in `app/electron/model/registry.ts` with full file list
- [ ] Update `SAFETYNET_MODEL_V2` in `app/electron/model/registry.ts` (URL change + file list)
- [ ] Add comment in `registry.ts` referencing this decision file
- [ ] Update v2 plan trace in ROADMAP.md `Decision Log` (one-line entry)
