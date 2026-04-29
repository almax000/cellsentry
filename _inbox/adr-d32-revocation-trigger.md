# ADR Trigger Brief: revoke D32 → web app pivot

> **Status**: PROPOSED — for DrCrow plan-debate review
> **Authored**: CellSentry session, 2026-04-29
> **Author intent**: This file is a trigger brief, not the ADR itself. DrCrow runs `/plan-debate` (architect → reviewer → revision → user approval). On accept, DrCrow assigns the new decision ID (likely D36, succeeding the existing D31-D35 set), updates PROJECT-BIBLE.md § 五 decision log, and sends back an `adr-d36-web-app-pivot.md` confirmation to CellSentry session. CellSentry then executes the implementation per Section 5 below.
> **Pending**: a researcher feasibility report (dispatched 2026-04-29 by CellSentry session) will be appended as Section 6 before debate. Do not run plan-debate without that section.

---

## 1. Context: what changed since D32 was locked (2026-04-26)

D32 said: "Electron-only desktop. No PWA. No mobile." Three rounds of architectural simplification have removed every reason CellSentry needed to be a desktop binary:

| Round | Date | What collapsed |
|---|---|---|
| Lean rebuild Day 1 | 2026-04-27 | D21 (LLM safety-net) + AD2 (Qwen-3B) revoked. **No more LLM in pipeline.** Renderer 1.38 MB → 480 KB. |
| Day 7 audit | 2026-04-28 | D35 revised: OCR demoted to opt-in (default disabled). PaddleOCR-VL 1.82 GB native MLX dependency removed from default flow. mlx-vlm Python subprocess removed from default. |
| Design call | 2026-04-29 | "涂黑" (visual blackout) replaces pseudonym substitution. OCR engine downsized further: PaddleOCR-VL 1.82 GB (VLM with markdown grounding) → PP-OCRv4 ONNX ~12 MB (traditional bbox-output OCR). Mapping schema flattened to redact-list. |

After these three rounds, CellSentry's runtime requirements are:
- jieba-wasm (CJK tokenization, ~300 KB)
- pdf.js (digital PDF text layer extraction)
- mammoth.js (DOCX text extraction)
- onnxruntime-web + PP-OCRv4 ONNX (image OCR, ~12 MB)
- Canvas API + pdf-lib (output rendering)

**Every single one of these runs in a browser.** No native filesystem access beyond what File System Access API provides; no Python subprocess; no MLX (Apple-Silicon-only); no platform-specific binary dependency.

D32's "Electron-only" was justified at the time by a stack that needed Python + MLX + 3.93 GB of model weights. **That stack no longer exists.** The only remaining argument for Electron is D32's perception framing.

## 2. Why D32's perception premise has weakened

D32's exact text:

> "不能 web，web 就没了纯本地、零上传、本地 AI 处理这个概念了。用户的理解还是把自己的私密文件上传到了一个网站上面。"

This was a perception concern, not a technical limitation. Two changes since:

### 2.1 D31 strategy formalization (content-pull via DrCrow video)

D31 (2026-04-27) repositioned CellSentry as a video-prop tool. The audience is **viewers of a privacy-AI-themed YouTube video**, not random web visitors. They have technical literacy and the disposition to verify claims. Distribution friction (Mac/Windows installer + Gatekeeper/SmartScreen + 90 MB download + 模型下载窗口) is the dominant barrier for that audience. A web app at cellsentry.pro/app removes 100% of that friction — viewer clicks description link → instantly using app.

### 2.2 Browser primitives D32 didn't reference

D32 was written before the team explicitly considered the modern browser-side trust stack:

- **HTTP CSP `connect-src 'none'`** — Browser-enforced, hard-blocks all outbound network requests (XHR, fetch, WebSocket, EventSource, beacon). User can verify in DevTools Network tab that zero requests fire during processing.
- **Service Worker + Web Manifest** — Installs as PWA to dock/taskbar; works fully offline after first load; visually indistinguishable from a desktop app for repeat users.
- **`navigator.onLine` indicator** — App can show explicit "OFFLINE ✓" state when user disconnects network; turns "trust me" into "see for yourself."
- **DevTools Network tab** — F12 transparency that the average video viewer can verify, in real time, on first use. **More auditable than an Electron desktop binary** (which is a signed black box for the average user).
- **Source maps in production** — The code F12 reveals IS the GitHub source. Auditable at any moment, on any device.

These primitives let a web app achieve the **same trust model** as Electron with significantly **better evidence** of the local-only claim.

## 3. Proposed decision changes

### REVOKE
- **D32** (2026-04-26 锁定): "Electron-only desktop. No PWA. No mobile."

### NEW (ID assigned by Bible — placeholder D36)
**Web-app pivot, offline-capable PWA**:
- CellSentry distributed as offline-capable PWA at cellsentry.pro/app (and self-hostable from open-source repo)
- All processing strictly client-side — no server-side processing exists; cellsentry.pro serves only static assets
- HTTP `Content-Security-Policy: connect-src 'none'` enforced on `/app/*` routes; auditable via DevTools Network tab
- Service Worker + Web Manifest for offline install (`beforeinstallprompt`, iOS Safari add-to-Home-Screen support)
- Cross-platform automatically: Mac/Windows/Linux/iOS/Android browsers
- Open source on GitHub (almax000/cellsentry); production build retains source maps for F12 audit
- Default trust UX: explicit ONLINE/OFFLINE banner; "How to verify" affordance that walks user through DevTools Network tab inspection

### REVISIONS to other decisions
- **D34 (input formats: txt/md/PDF/DOCX/image; cloud OCR forbidden)** — still applies; cloud OCR still forbidden; OCR engine swaps from MLX-native PaddleOCR-VL to onnxruntime-web with PP-OCRv4 ONNX
- **D35 (PaddleOCR-VL + 3-tier quantization + DS-OCR-2 fallback + dogfood gate)** — REVISED. OCR engine is PP-OCRv4 ONNX (single tier, ~12 MB). DS-OCR-2 fallback dropped (no longer relevant for printed Chinese documents — see 2026-04-29 design conversation about handwritten/印章/老纸质 = 0 % of inputs)
- **D19 (literal replaceAll, longest-key-first)** — REVISED. The literal replaceAll claim was wrong for CJK due to substring collisions ("张三" in "血管扩张三次", "张力" in "肌张力减低", etc.). Replaced with **jieba whole-token CJK match + literal replaceAll for non-CJK + mandatory user preview with per-match correction toggle**. (Detailed in 2026-04-29 design conversation.)

### NEW (also from 2026-04-29 design conversation)
**Output philosophy: visual blackout, not pseudonym substitution**:
- Output is "removed" not "replaced": `█` block characters for text, black rectangles for images
- No labels (`[姓名]` / `[手机号]`) — pure visual blackness
- No counter-based pseudonym generation (患者A / 患者B / ...)
- No multi-person disambiguation in output (one redact list per session; user manages disambiguation by listing all names)
- Mapping schema simplified to flat string list (no patient_id / aliases / additional_entities nesting)
- Mandatory preview UI before save — per-match toggle for false-positive correction (e.g., "张力" wrongly redacted inside "肌张力减低")

## 4. Trade-offs honestly

| Dimension | Electron (D32) | Web app (D36 proposed) |
|---|---|---|
| **Install friction** | High (DMG/Setup.exe, signing prompts) | Zero (URL click) |
| **Cross-platform reach** | Mac arm64 + Windows x64 (two builds) | One codebase; all OS browsers including mobile |
| **Default trust narrative** | "Desktop = local" automatic, opaque to verification | "Web = upload" requires explicit dispel; verification trivial |
| **Code transparency for end user** | Limited (binary inspection) | Full (F12 + view source + source maps) |
| **OCR performance** | Native ~0.3-1s/image (mlx-vlm path, when bundled) | WASM ~3-8s/image (onnxruntime-web; pending researcher confirmation) |
| **Bundle size** | Mac DMG ~90 MB + lazy 1.82 GB OCR weights | ~10 MB JS+WASM static + ~12 MB OCR ONNX lazy |
| **Updates** | electron-updater (delta updates, manual on user's side) | Page refresh (instant) |
| **Code signing cost** | $200/year per platform (currently unsigned, causing Gatekeeper/SmartScreen friction) | Zero |
| **Strategy alignment with D31** | Distribution friction inversely scales with content-pull effectiveness | Removes the friction layer entirely |

## 5. Required actions if D36 accepted

### CellSentry session (immediate, post-acceptance)
- ✅ Already done (2026-04-29): archive current `main` HEAD `af9c2f6` as `archive/v2-electron` branch and `electron-era-eol` tag (frozen, never modified again)
- ✅ Already done (2026-04-29): create `web` branch from same commit (clean starting point for new dev)
- Proceed with feasibility researcher report (dispatched, pending — see Section 6)
- Switch active dev to `web` branch
- Begin Phase 1 implementation (skeleton: Next.js static export + Service Worker + jieba-wasm + pdf.js + mammoth.js)
- Do NOT touch `main` until web app is feature-complete; eventually replace `main` with `web` content via fast-forward or merge

### DrCrow session (post-debate)
- D32 status → REVOKED in PROJECT-BIBLE.md § 五 decision log
- D36 logged with above content
- Plan v3 references to D32: marked stale; pointer to D36
- D19 / D34 / D35 entries updated per § 3 above

### Documentation cascade (CellSentry session, after web app skeleton works)
- VISION.md / SCOPE.md / ROADMAP.md / publish/README.md / website i18n: rewrite for web-app posture (this is "Day 7 audit, second pass" but bigger)
- Electron build pipeline (electron-vite, electron-builder.yml, .github/workflows/build-mac.yml + build-windows.yml): retired; replaced with Next.js static export + CF Pages deploy
- v1.1.0-beta.1 desktop release: still permanently available at v1 release tag; v2 desktop builds were never publicly shipped, so no EOL announcement needed

## 6. Feasibility verification (researcher report, 2026-04-29)

**Overall verdict: Conditional Go.** Architecture is feasible, no structural blockers, but three risks demand pre-commitment mitigations + one finding materially changes the proposed PDF redaction architecture.

### Per-dimension assessment

| # | Dimension | Verdict | Key data |
|---|---|---|---|
| 1 | Image OCR (PP-OCRv4 mobile + onnxruntime-web) | ⚠️ Feasible with caveats | 20-30 MB OCR payload; **2-4s/page on M-class desktop, 6-12s on mobile, 15-30s on old Android**. Bbox output native. Best library: `ppu-paddle-ocr` v5.1.1 (released 12 days ago). **Use PP-OCRv4 mobile (~16 MB), NOT v5 (~81 MB)**. iOS Safari has known WASM-SIMD/JSEP bugs (issues #15644, #26827) — must avoid JSEP path |
| 2 | CJK tokenization | ✓ Feasible | **`Intl.Segmenter` ('zh', granularity:'word') is Baseline-supported (Chrome 87+, Safari 14.1+, Firefox 125+) and 0 KB.** Quality: ICU's Chinese breaker ~85-92% vs jieba ~93-97% on general text. **Recommendation: Intl.Segmenter primary, jieba-wasm (~2 MB compressed) as opt-in fallback for medical-specific terms** |
| 3 | CSP `connect-src 'none'` | ✓ Feasible with companions | Blocks fetch/XHR/WebSocket/EventSource/beacon. **Two required companions**: `script-src 'self' 'wasm-unsafe-eval'` (else WASM compile rejected); precache wasm in SW + load via `caches.match` then `WebAssembly.compile(arrayBuffer)` (cannot use `instantiateStreaming` under `connect-src 'none'`). SW registration uses `script-src`, not `connect-src` — unaffected |
| 4 | PWA + Service Worker offline (~50 MB bundle) | ⚠️ Caveats on iOS | Chrome desktop: trivial. **Safari ~50 MB Cache API limit — at cliff edge**. iOS ITP: 7-day eviction for non-installed PWAs (installed = exempt since iOS 16.4). Realistic payload: **26-30 MB core, 36-40 MB with all fallbacks** — fits under 50 MB. Use Workbox precache + CacheFirst |
| 5 | File handling | ⚠️ Caveats (Safari/Firefox) | `showSaveFilePicker`: Chrome/Edge only (~74% global). **Firefox + Safari: never**. Fallback: blob+anchor download → works 100% but no folder choice. PDF.js needs page-by-page `page.cleanup()` for large files |
| 6 | **Output rendering — CRITICAL FINDING** | ✗ Naive overlay BLOCKER → ✓ Rasterize-and-rebuild required | **pdf-lib black-rectangle overlay does NOT actually redact** — text layer remains, copy/search/screen-reader extractable. This is the Manafort-2019 / Trump-Russia-filings failure mode. **Must rasterize each PDF page (200-300 DPI) → draw black on canvas → embed JPEG into new PDF**. Loses: PDF/A compliance, signatures, searchability, file size 5-10× larger. DOCX format-preservation: no mature pure-browser library; v1 = drop formatting, v1.5 = direct OOXML XML edit (~300 LOC, JSZip + DOM walk on `word/document.xml`) |
| 7 | Predecessors | ✓ Validated | 2redact.com (Tesseract.js, commercial closed-source); AutoRedact (75⭐, Tesseract, English-only); redactpdf (~6 commits, vanilla JS, demonstrates <500 LOC viable). **No production-quality browser app does Chinese medical OCR + redaction** — CellSentry first-mover in this niche |

### Architectural revisions vs the § 3 proposal

The § 3 proposal mentioned PaddleOCR-VL → PP-OCRv4 swap. Researcher findings necessitate three additional adjustments:

1. **PDF redaction is rasterize-and-rebuild, not overlay** (§ 6 finding above). Output is image-only PDFs; ~5-10× source size; loses signatures + searchability. **This is non-negotiable for safety** — overlay would ship a fake-redaction. Document trade-offs in user-facing copy: "Redacted PDFs are intentionally non-searchable; the redaction is permanent."
2. **Intl.Segmenter primary, jieba-wasm fallback** (not jieba primary as § 3 implied). Saves ~2 MB bundle in default path. Jieba kept as opt-in for users hitting domain-specific edge cases.
3. **COOP+COEP headers required** on `/app/*` for SharedArrayBuffer (needed by onnxruntime-web threaded path). Cloudflare Pages supports `_headers` file for this; trivial to ship.

### Top 3 Risks (researcher-ranked)

1. **OCR latency on mobile / older hardware unusable** (High impact). 15-30s/page on mid-range Android = users close tab. **Mitigation**: scope mobile to "view-only/preview"; require desktop for actual redaction work; show live "estimated time" counter on upload screen.
2. **PDF rasterize output quality + size** (Medium-High impact). 5-10× size growth; clinicians sharing redacted records may have downstream tools that expect text-PDF. **Mitigation**: default to safe rasterize-and-rebuild; offer explicit "Fast mode (overlay only — text still extractable)" toggle with stern warning for users who want screen-share-only redaction.
3. **iOS Safari second-class citizen** (Medium impact). 50 MB cache cliff + 7-day eviction + no save picker + no install prompt + WASM bugs. **Mitigation**: render iOS-specific share-menu install banner with screenshots; drop PP-OCRv5 from iOS path entirely; document "for full power use desktop browser" prominently.

### Existing precedent for the trust pitch

`digidigital/CoverUP` (~100⭐, Python desktop) markets itself with: *"The content of the redacted PDF is converted to images, so it is impossible to copy the remaining visible text without OCR"* — this is **the exact reassurance phrasing CellSentry should adapt** for the rasterize-and-rebuild output. The user-facing language is already validated.

### Sources

Full source list (40+ links covering caniuse, MDN, GitHub issues, HuggingFace model cards, browser-OCR project comparisons, ICU CJK breaker docs, PDF redaction failure analyses) preserved in researcher transcript at `/private/tmp/claude-501/-Users-jojo-Documents-cellsentry-dev/7cc11f88-53eb-47f1-8841-a07a31c461b7/tasks/a81a8f6e36a3fb2a6.output`. Key citations:
- ppu-paddle-ocr v5.1.1: github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr
- ONNX Runtime Web iOS issues: microsoft/onnxruntime#15644, #26827
- PDF redaction failure precedent: xugj520.cn/en/archives/pdf-redaction-failures-data-exposed.html
- Intl.Segmenter Baseline: web.dev/blog/intl-segmenter
- digidigital/CoverUP rasterize trust phrasing: github.com/digidigital/CoverUP
- 2redact.com architecture (Tesseract+pdf.js+pdf-lib, rasterize-and-rebuild): 2redact.com

## 7. Risk register (post-researcher)

| Risk | Likelihood | Impact | Mitigation if hit |
|---|---|---|---|
| **Mobile / older hardware OCR latency unusable** (researcher #1) | Medium-High | High | Scope mobile to view-only; require desktop for redaction; live ETA counter |
| **PDF rasterize output 5-10× source size + lost signatures** (researcher #2) | High (it WILL happen) | Medium-High | Default rasterize (safe); opt-in "Fast mode = overlay only, text extractable" with warning |
| **iOS Safari degraded (50 MB cliff, 7-day eviction, WASM bugs)** (researcher #3) | High (architectural reality) | Medium | iOS-specific share-menu install banner; drop v5 from iOS; "use desktop for full power" copy |
| Audience perception "web = upload" doesn't reverse despite UX work | Low | High (strategic) | DrCrow video script dedicates 30s to F12 demonstration; if perception resists, revert to Electron-hybrid |
| CSP/COOP/COEP misconfigured on Cloudflare Pages, breaking threads | Low | Medium | `_headers` file with required CSP + COOP+COEP; verify in DevTools after deploy |
| WebKit 26 / iOS 16.4+ ONNX Runtime Web bugs hit production users | Medium | Medium | Avoid JSEP path entirely; pin to plain WASM SIMD; if bugs hit, fallback to Tesseract.js for affected sessions |

---

## Status checklist for DrCrow before running plan-debate

- [x] Section 6 (researcher feasibility report) appended (2026-04-29)
- [x] CellSentry session has confirmed `archive/v2-electron` branch + `electron-era-eol` tag pushed (2026-04-29)
- [x] CellSentry session has confirmed `web` branch created (2026-04-29)
- [ ] DrCrow side: ready to renumber decisions (D36 placeholder, may shift) and update PROJECT-BIBLE.md § 五

**ADR is now ready for plan-debate.** All three pre-conditions met. Next action: DrCrow runs `/plan-debate` (architect → reviewer → revision → user approval), produces verdict, sends back ADR-D36 confirmation to CellSentry session.

---

*End of trigger brief. CellSentry session standing by for: (a) researcher report to land, (b) DrCrow plan-debate verdict, (c) implementation green light.*
