# CellSentry v2 — Lean Rebuild Release Notes (DRAFT, internal)

> **Status: DRAFT, not for public release.** Per ADR D31 (video-prop positioning, content-pull, no PR/X/Reddit motion), the lean rebuild is shipped via git only. These notes exist for jojo's reference — when DrCrow video lands and dogfood gate passes, the relevant parts can be cherry-picked into a public-facing announcement.

## Snapshot

- **Branch / commit at lean-rebuild-complete:** `main` @ `<final commit hash>`
- **Rollback line:** tag `pre-lean-rebuild` at W6 commit `18ac7f9`
- **Authoritative ADR:** `~/Movies/DrCrow/.claude/plans/adr-d20-thru-d31-cellsentry-lean-pivot.md`
- **Timeline:** 5–6 days dev (2026-04-27 lean-rebuild-day-1..6)

## What changed (one-liner per area)

- **Pipeline:** 5 stages → 3 stages. Mapping is now the primary control, regex is the fallback.
- **OCR engine:** DeepSeek-OCR-8bit (3.93 GB, 87 % OmniDocBench) → PaddleOCR-VL-1.5 (1.82 GB bf16 / 1.10 GB 8-bit / 0.72 GB 4-bit; 94.5 % OmniDocBench).
- **PII scope:** 6 categories explicit — names, phone, address, ID, social-security, employer. Address + employer are user-mapping-only by design.
- **Input formats:** added DOCX (mammoth.js) and `.md`.
- **UX:** removed CodeMirror (mapping editor is now a plain textarea), removed collision-warning overlay, removed safety-net review screen, removed date-mode selector. Phase machine reduced from 4 to 3 phases.
- **Bundle:** renderer 1.38 MB → 480 KB (65 % smaller).
- **Tests:** 236 → 118 vitest (128 deleted along with their source modules; 10 added).

## What was revoked

| Decision | Original intent | Reason for revocation |
|---|---|---|
| **D21** | LLM safety-net pass (Qwen2.5-3B) flags missed names | Buys nothing for a video-prop tool; user's own mapping covers their own family/friends already |
| **AD2** | Qwen2.5-3B-Instruct-4bit (1.75 GB on top of OCR) | Eliminated by D21 revocation |
| **AD3** | jieba whole-token + cross-text collision pre-scan | D19 reinterpreted as literal `String.prototype.replaceAll` with longest-key-first ordering — simpler mental model, same correctness for the cases the user actually faces |
| **PWA path** | Web/PWA distribution alongside desktop | D32: "web 没了纯本地、零上传 的概念" — defeats the core privacy promise |

## What was revised

| Decision | Old | New |
|---|---|---|
| **D19** | jieba whole-token user-dict replacement | Literal `String.prototype.replaceAll`, longest-key-first |
| **D20** → **D35** | DeepSeek-OCR-8bit primary | PaddleOCR-VL-1.5 (3 quantization tiers) primary + DS-OCR-2-8bit settings-switchable fallback |
| **AD8** | Python server with `analyze` + `ocr` methods | OCR-only (`status` + `ocr` + `shutdown`) |
| **AD10** | Multi-model directory registry (OCR + safety-net) | Single OCR DirectoryModel selected by RAM tier |
| **D25** | 7.5-week timeline | ~6.5 weeks — W7.5 PR/X/blog motion cut by D31 |

## What's new (non-revocation)

- **D31** Video-prop positioning: CellSentry v2 = DrCrow video demo prop. No PR, no X thread, no Reddit, no Hacker News. Content-pull (DrCrow channel) over product-push.
- **D32** Electron-only desktop. No PWA. No mobile.
- **D33** PII scope locked at 6 categories.
- **D34** Input formats locked at txt / md / digital PDF / DOCX / image. **Cloud OCR explicitly forbidden** — image input goes through local PaddleOCR-VL only.
- **D35** Three-tier RAM-based OCR quantization auto-selection + dogfood gate (≥50 real Chinese medical samples, ≥5 per category, CER < 10 %, three holy grails: handwritten / rare drugs / stamped pages all ≤2 errors per sample).

## Verification at lean-rebuild-complete

```
npm run typecheck → green (node + web)
npm run build     → green; renderer 480 KB / main 47 KB / preload 3 KB
npm run test      → 118 / 118 vitest passing
npm run test:e2e  → (Day 6 — placeholder spec; full E2E rewrite belongs to dogfood phase)
python smoke      → status method returns JSON in <0.5s
website build     → green (en + zh-CN, includes /blog/v2-pivot)
```

## Known gaps for the dogfood phase

- **Real-OCR smoke test deferred** to user (needs `pip install -r requirements.txt` + ~1.82 GB PaddleOCR-VL-1.5-bf16 download). The lean rebuild changed the OCR engine + prompt — needs at least one real-image round-trip before the video demo.
- **DOCX fixture E2E test not written** — Day 3 added the loader but didn't include a `.docx` fixture. Day 6 E2E only covers the textarea path.
- **Settings UI for engine override** not yet built — `CELLSENTRY_OCR_TIER` env var works but there's no in-app toggle. This is fine for jojo's own use; only matters if dogfood reveals a need for users to override.
- **Inline `.md` file loader IPC** — the dialog filter accepts `.md` but the renderer doesn't yet have a "read .md and paste into textarea" path. User can still paste manually.

## Rollback path

If lean rebuild proves wrong:

```
git reset --hard pre-lean-rebuild   # back to W6 head
```

Note: this is a code-level rollback only. Re-enabling D21 / AD2 / AD3 as decisions requires a new ADR + Bible state-field reversion + plan v3 references re-opened (per ADR § 6.4).

---

*Draft authored 2026-04-27 alongside lean-rebuild-day-6. Do not publish until DrCrow video lands + dogfood gate passes.*
