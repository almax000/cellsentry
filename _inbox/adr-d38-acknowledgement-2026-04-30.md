---
type: ADR-acknowledgement
target: ADR-D38 (CellSentry v2 Web-App Pivot)
target-verdict-file: ~/Movies/DrCrow/.claude/plans/adr-d36-web-app-pivot-verdict.md
date: 2026-04-30
session: CellSentry session @ ~/Documents/cellsentry-dev
acknowledgement-summary: 14/14 ACK · 0 DEVIATE
---

# ADR-D38 Acknowledgement Note

CellSentry session has read ADR-D38 in full (50 KB, 410 lines, bilingual EN/ZH). The 14 binding conditions in § 5 are acknowledged below, line by line, in the prescribed format. **All 14 conditions are accepted without deviation.**

CellSentry session 已通读 ADR-D38（50 KB，410 行，中英双语）。§ 5 的 14 项约束逐条确认如下。**14 项全部接受，无偏离。**

Two reviewer pushbacks vs the trigger brief are noted as **correctly identified failure modes** in the original brief and have shifted CellSentry session's understanding:

两项反推被 CellSentry session 视为**触发简报中的真错误**，已修正理解：

1. **"Fast mode = overlay only" rejected (A1).** The trigger brief proposed this as opt-in with stern warning. Reviewer correctly identified it as the Manafort-2019 / Trump-Russia-2020 / NSA-2014 fake-redaction class itself — a tool that retains the path will, statistically, ship at least one user-error redaction failure that destroys CellSentry's privacy brand in one event. The opt-in framing does not mitigate; users who don't read warnings are exactly the population the safe path must protect. Acknowledged and committed: **only rasterize-and-rebuild path; only sanctioned size-compression knob is JPEG quality 60.**

   触发简报把它作为带严厉警示的 opt-in 提出。Reviewer 正确指认为 Manafort-2019 / Trump-Russia-2020 / NSA-2014 假脱敏类本身 —— 保留此路径的工具，从统计上必将出至少一次用户操作失误的脱敏失败，**一次就够把 CellSentry 隐私招牌赔光**。Opt-in 框架不缓解风险；不读警示的用户正是安全路径必须保护的人群。已接受并承诺：**只走 rasterize-and-rebuild；唯一获许的大小压缩旋钮是 JPEG quality 60**。

2. **`ppu-paddle-ocr` v5.1.1 rejected as runtime dependency (B1).** The researcher report had named it "most actively maintained option" (released 12 days ago at time of research). Reviewer correctly inverted the framing: "released 12 days ago + 55 stars + unverified supply-chain pulse" is a **risk profile**, not a quality signal, for a tool whose core promise is privacy. Acknowledged and committed: **vendor PP-OCRv4 mobile ONNX directly into the repo; runtime depends only on `onnxruntime-web` (Microsoft, mature). `ppu-paddle-ocr` may be referenced for pre/post-processing patterns and copy-vendored if upstream goes silent, but is not a runtime dependency.**

   Researcher 报告把它列为「最积极维护选项」（调研时发布 12 天）。Reviewer 正确翻转框架：「发布 12 天 + 55 星 + 供应链脉搏未证」对一个隐私工具来说是**风险特征**，不是质量信号。已接受并承诺：**直接 vendor PP-OCRv4 mobile ONNX 进 repo；运行时仅依赖 `onnxruntime-web`（微软成熟项目）。`ppu-paddle-ocr` 可作预/后处理模式参考，上游沉默时 copy-vendor，但不是运行时依赖**。

---

## Category A — Output safety / 输出安全

### A1. No "Fast mode = overlay only" toggle

**Status: ACK**

CellSentry session commits: PDF redaction will use **rasterize-and-rebuild only** (per ADR-D38 § 3.5.5). No overlay-only mode will be implemented, even as opt-in, even with warning. Bible-side documentation, user-facing copy, and code-level tests will all enforce single-path semantics.

If file-size compression is needed, the only sanctioned mechanism will be **"Smaller-file mode" via JPEG quality 60** (default 85). This is same-vector compression with no safety regression — the rasterized canvas is still committed to image format; only the JPEG quality knob moves.

Implementation note: I will write at least one E2E test that **hex-greps the produced PDF for the original sensitive string** to confirm the text layer is genuinely absent (not just visually covered). This catches future regressions where a refactor accidentally re-introduces a text-overlay path.

承诺：PDF 红化只走 rasterize-and-rebuild（按 ADR-D38 § 3.5.5）。不实现 overlay-only 模式，即使作为 opt-in，即使带警示。Bible 文档、用户文案、代码层测试全部强制单路径语义。需文件大小压缩时唯一获许机制为 **「小文件模式」即 JPEG quality 60**（默认 85）—— 同向量压缩无安全回退。会写至少一个 E2E 测试 **hex-grep 输出 PDF 是否真的无原始敏感字符串**（不只是视觉覆盖）。

### A2. D35 REVOKED, not revised; CER threshold re-set for PP-OCRv4

**Status: ACK**

CellSentry session commits: D35 will be marked **REVOKED** (not REVISED) in all CellSentry-side documentation (`.claude/product/ROADMAP.md`, `_inbox/lean-rebuild-release-notes.md`, README, etc.). I had originally proposed REVISED in the trigger brief; reviewer's argument is correct — engine swap (PaddleOCR-VL VLM 1.81 GB ↔ PP-OCRv4 ONNX ~16 MB) constitutes substantive replacement, not revision, and calling it "revision" obscures decision history.

CER threshold for PP-OCRv4 will be **empirically re-established** during dogfood gate runs. No carryover of the D35 < 10% number. Initial benchmark methodology: jojo runs ≥ 50 real samples (each category ≥ 5: lab / 处方 / 体检 / 病历 / 影像 / 出院), produce CER distribution, set threshold at the higher of (a) the empirical 90th percentile of the printed-text inputs or (b) 10%, whichever is more permissive. Threshold value gets locked in a follow-up Bible note when dogfood completes.

Holy-grail scenarios (handwriting / 印章 / 老纸质) explicitly out-of-scope, documented in user-facing copy with the language reviewer suggested: **"PP-OCRv4 is optimized for printed Chinese; handwritten / sealed / aged-paper inputs may fail. For these cases, manual transcription is recommended."**

承诺：D35 在 CellSentry 端文档全部标 **REVOKED**（非 REVISED）。CER 阈值按 PP-OCRv4 实测重设，dogfood 后落 follow-up Bible note。圣杯场景明确移出 scope，用户文案使用 reviewer 建议措辞。

### A3. DOCX OOXML edit path committed to v2.0.x roadmap

**Status: ACK**

CellSentry session commits: v1 web-skeleton ships with mammoth.js extract → blackout → plain-text DOCX output (formatting lost) as acceptable scope. **OOXML edit path is committed to roadmap with explicit target version v2.0.2** (or earlier — to be locked when web skeleton ships). Implementation strategy: ~300 LOC via JSZip + DOM walk on `word/document.xml`, walking `<w:t>` elements and replacing text content while preserving run/style markers. Multi-run text spans (Word's tracked-changes / rsid attribute artifacts) acknowledged as a known limitation of this approach; documented as a v2.0.3+ improvement opportunity.

ROADMAP.md will be updated with this target version on the same commit that lands web skeleton, not later. v1.5 status will not be allowed to drift into vapourware.

承诺：v1 web 骨架 ships with 丢格式的 DOCX 输出。**OOXML 编辑路径承诺写入 roadmap，目标版本 v2.0.2**（或更早）。实现策略：~300 LOC 经 JSZip + `word/document.xml` DOM 遍历。多 run 跨段文本（Word 跟踪修改 / rsid 属性产物）认知为已知限制，文档化为 v2.0.3+ 改进机会。Roadmap 更新与 web 骨架交付**同提交**，不延后。

---

## Category B — Dependency hygiene / 依赖卫生

### B1. Vendor PP-OCRv4 mobile ONNX directly; runtime depends only on onnxruntime-web

**Status: ACK**

CellSentry session commits: PP-OCRv4 mobile det.onnx + rec.onnx + classifier (if applicable) **vendored directly into repo via Git LFS** (not as runtime npm dependency). Source of truth: HuggingFace `PaddlePaddle/PP-OCRv4_mobile_*` repos, copied into `app/public/models/ocr/` (or equivalent CF-Pages-served path). Runtime npm dependencies for OCR: **only `onnxruntime-web`** (Microsoft).

`ppu-paddle-ocr` v5.1.1 is **not** added to package.json. Its source code (pre-processing image normalization, post-processing CTC decoding, NMS for detection bboxes) is studied and selectively copy-vendored into our own `app/lib/ocr/` directory. Each vendored function carries a header comment crediting the upstream MIT-licensed origin per the package's license terms.

If upstream `ppu-paddle-ocr` releases bug fixes or improvements, we manually port the patches; we do not chase it as a moving target.

承诺：PP-OCRv4 mobile ONNX 经 Git LFS 直接 vendor 进 repo（非 runtime npm 依赖）。来源 HuggingFace，复制至 `app/public/models/ocr/`。Runtime npm 依赖仅 **`onnxruntime-web`**。`ppu-paddle-ocr` 不加入 package.json；其源码选择性 copy-vendor 至 `app/lib/ocr/`，函数头注释保留 MIT 来源致谢。上游修复手工 port，不追新。

### B2. SHA-256 integrity pinning for model + downloaded assets

**Status: ACK**

CellSentry session commits: vendored ONNX model files have SHA-256 hashes recorded in `app/public/models/ocr/MANIFEST.json` (or equivalent). Build-time check verifies file SHA-256 matches manifest before bundling. Run-time check verifies fetched asset SHA-256 matches manifest before invoking `WebAssembly.compile()`. Tampered or corrupted models trigger explicit error UI rather than silent fallback.

For the ONNX model fetch path (when not pre-bundled into the SW precache): primary HuggingFace, fallback ModelScope per existing D29 locale-aware routing. **Pin specific commit hash**, not branch name (e.g., `https://huggingface.co/PaddlePaddle/PP-OCRv4_mobile_rec/resolve/<commit-sha>/inference.onnx`). The "latest" pointer is explicitly forbidden.

CDN-loaded JS dependencies (if any non-self-hosted) carry SRI hashes in `<script integrity="sha384-...">` attributes. CSP `script-src` will use `'self'` to disallow third-party scripts entirely; this acknowledgment is forward-protection in case of future CDN exception.

承诺：vendored ONNX 模型在 `MANIFEST.json` 记 SHA-256。构建时 + 运行时双重校验。Fetch 路径用 commit-hash pin（不用 branch name / latest）。CDN-loaded JS 用 SRI；CSP `script-src 'self'` 禁第三方。

### B3. JSEP path globally disabled

**Status: ACK**

CellSentry session commits: onnxruntime-web initialization **explicitly disables JSEP / WebGPU execution provider on all platforms** (not just iOS). Configuration: `executionProviders: ['wasm']` only; do not include `'webgpu'` or `'jsep'` in the provider list, even on Chrome where it would technically succeed.

Rationale acknowledgement: onnxruntime issues #15644 (iOS Safari WASM-SIMD broken) and #26827 (WebKit 26 JSEP memory leak) are not the only failure modes — they are the visible ones. The pattern is "JSEP path has tail latency / memory issues that surface unpredictably." For a video demo prop where every viewer's first impression matters, predictable plain-WASM-SIMD performance > occasionally-faster-but-sometimes-broken JSEP.

If future onnxruntime-web releases prove JSEP stable, this decision can be revisited via new ADR. The default is OFF, not "OFF except where stable."

承诺：onnxruntime-web 全平台禁 JSEP / WebGPU EP。`executionProviders: ['wasm']` 唯一。已知 issues #15644 + #26827 是可见的，模式是「JSEP 尾延迟 / 内存问题不可预测」。视频道具优先可预测性。未来 JSEP 稳定可经新 ADR 重审。默认 OFF，不是「OFF except where stable」。

---

## Category C — Mobile + iOS UX / 移动端 + iOS UX

### C1. Low-spec device interstitial

**Status: ACK**

CellSentry session commits: before invoking image OCR (the heavy path), runtime feature-detects:
- `navigator.hardwareConcurrency < 4`
- `navigator.deviceMemory < 4` (note: `deviceMemory` is undefined on Safari; treat undefined as fail-open per spec — only blocks when actively low, not when value missing; acknowledged risk that some Safari users with low-RAM devices won't get the interstitial; mitigation = supplement with `navigator.userAgent` mobile detection)

When both conditions trigger AND user attempts image OCR: render an interstitial gate with three options:
- "Continue anyway" (proceeds with ETA timer)
- "Use desktop instead" (link to desktop URL with note "open this on a Mac/PC")
- "Try text input" (redirect to plain-text paste path, which is fast on any device)

This converts implicit UX failure (user closes tab after 30s wait) into deliberate user choice. Live ETA counter is supplementary, not replacement.

承诺：图片 OCR 前特征检测 cores < 4 + memory < 4，触发拦截页给三个选项：继续/桌面/文本输入。把隐式失败转为主动选择。`navigator.deviceMemory` 在 Safari 未定义按 fail-open 处理 + UA 移动端检测补强。

### C2. Objective trust-fallback judgment criterion

**Status: ACK**

CellSentry session commits to recording the objective fallback criterion verbatim in the canonical D38 text within `.claude/product/SCOPE.md`:

> "If 30 days post-DrCrow-video-launch, `cellsentry.pro/app` bounce rate > 70% OR 'is it uploading' / 'is this safe' / similar comments > 10% in DrCrow video comment thread, trigger Electron-hybrid fallback evaluation."

Operational instrumentation:
- CF Pages Web Analytics (already enabled per existing config; no third-party trackers needed) provides bounce rate.
- DrCrow video comment thread analysis is manual (jojo + DrCrow session) on the day-30 marker.
- Trigger logged as Bible note even if criterion not met (so future ADR debates have the historical record of "we checked at day 30, criterion was X%, decision was stay-on-web").

This converts "should we revert?" from a psychological oscillation into a date-bounded decision with simulator-resistant inputs.

承诺：D38 文本含逐字判据于 `.claude/product/SCOPE.md`。CF Pages Web Analytics + 手工评论分析。day-30 标记，无论触发与否都记 Bible note。把「是否回退」从心理摇摆转为日期-bounded 决策。

---

## Category D — Decision-level scoping / 决策级 scoping

### D1. D19 output philosophy = parallel addition (not rewrite)

**Status: ACK**

CellSentry session commits: when documentation cascade reaches D19's text in `.claude/product/SCOPE.md` and any other CellSentry-owned reference, the wording will explicitly frame blackout-output as a **parallel addition** to D19's responsibility model, not a rewrite of it. The phrasing pattern (modeled on the verdict's § 3.4(c)):

> "D19 user-provides-mapping responsibility model is intact. Output rendering changes from substitution to blackout per ADR-D38 § 3.5.X. The matching algorithm changes from literal `replaceAll` to Intl.Segmenter primary + jieba-wasm fallback + literal `replaceAll` for non-CJK + mandatory preview UI per ADR-D38 § 3.4(a-b). These are implementation revisions; D19's semantic contract — user provides the redact list, system applies it deterministically across documents — is unchanged."

Bible-side D19 row text update is DrCrow's ownership per § 7.

承诺：CellSentry 端文档（含 SCOPE.md）涉及 D19 的措辞将明确呈现「并行新增」而非重写。原文契约（用户提供 redact-list，系统跨档案确定性应用）不变；输出渲染换涂黑，匹配算法换 Intl.Segmenter 主 + jieba 备 + preview。

### D2. D31 reach-threshold caveat preserved verbatim

**Status: ACK**

CellSentry session commits: the exact text below appears verbatim in `.claude/product/SCOPE.md` D38 section + `.claude/product/ROADMAP.md` D38 entry + any future ADR draft that references the strategy:

> "web-app low external-install count is NOT CellSentry product failure — diagnose as channel-reach bottleneck. Architects, reviewers, future planners must not retroactively reframe this."

This is a no-paraphrase clause. If a future planner reasons "let's relax this for [reason]", that move requires a new ADR explicitly addressing D31, not a documentation drift.

This protects against the soft-drift mode where 6 months from now someone reads "low downloads" as "the product flopped" and proposes a marketing motion that violates D31's content-pull-only mandate.

承诺：原文逐字保留于 SCOPE.md / ROADMAP.md / 任何未来 ADR 草案。无释义条款。未来 planner 想松绑必须经新 ADR 明确处理 D31。防 6 个月后软漂移。

---

## Category E — Operational rules compliance / 运营规则合规

### E1. E013 proxy compliance through dev pipeline

**Status: ACK**

CellSentry session commits: all dev-time package installs (`npm install onnxruntime-web` / `pdf-lib` / `mammoth` / `jszip` / etc.), HuggingFace ONNX weight downloads, and `wrangler pages deploy` calls go through `HTTP_PROXY=http://127.0.0.1:7890` and `HTTPS_PROXY=http://127.0.0.1:7890` per CLAUDE.md global env config.

Specifically forbidden in any future commit, script, CI workflow, or documentation under CellSentry-dev ownership:
- `unset HTTP_PROXY` / `unset HTTPS_PROXY`
- `--no-proxy` / `--noproxy` flags on any command
- `HTTP_PROXY=""` / empty-value assignments
- `NO_PROXY="*"` (only specific localhost addresses allowed)
- `npm config delete proxy` / equivalent for pnpm/bun/yarn
- `git config --unset http.proxy`

If a future task genuinely requires bypass (e.g., GFW debugging), CellSentry session will stop, surface the situation to user, and request user-side execution. CellSentry session never executes the bypass itself. Per E013, this is a non-negotiable iron rule.

Web-app runtime in user's browser is out-of-scope for E013 (browser → user's network configuration).

承诺：所有 dev-time 包安装 + 模型下载 + 部署经 `HTTP_PROXY=http://127.0.0.1:7890`。CLAUDE.md E013 铁律列出的所有禁止操作（unset/--no-proxy/空值/`*`/包管理器删 proxy/git unset）一律禁止。如未来任务必须绕代理，CellSentry session 停下交用户处理，绝不自行执行。Web-app 运行时在用户浏览器（out-of-scope）。

### E2. Secrets handling

**Status: ACK**

CellSentry session commits: `CLOUDFLARE_API_TOKEN` for `wrangler pages deploy` is sourced from `~/.secrets` (which is shell-sourced into env via `~/.zshrc` per global config). Never written to:
- `wrangler.toml` (or any tracked wrangler config file)
- `.github/workflows/*.yml` (workflow files use `${{ secrets.NAME }}` GitHub-side injection)
- `package.json` / `.env.example` / any tracked file

Existing secret pattern verified by grep on push: pre-commit hook (or manual review) checks for known secret patterns (`ghp_`, `sk-`, `AKIA`, `key=`, `secret=`, `token=`) before allowing commit. If absent today, will be added.

承诺：CF API token 经 `~/.secrets`，绝不入 wrangler.toml / workflow yml / package.json / .env.example / 任何受版控文件。建立或验证 pre-commit secret 模式 grep。

### E3. E014 quarantine inheritance for IndexedDB redact-list IO

**Status: ACK**

CellSentry session commits: web-app's persistent storage for user's redact-list (whether via IndexedDB or File System Access API target file) inherits the W5 commit `66863b0` writer-quarantine pattern.

Concrete implementation pattern:
- On read: try `JSON.parse(stored_blob)`. On parse failure → copy bad blob to `<key>.corrupt.<ISO-timestamp>` IndexedDB key BEFORE any write happens; then surface ERROR-level log (console.error with full detail: key path, target path, parse error message) AND surface a UI banner ("Your saved redact list could not be loaded; the corrupt copy was preserved at [key].corrupt.[timestamp] — please rebuild your list manually or contact support"). Never silently default to `[]` and overwrite.
- On write: never overwrite existing key without first reading + verifying integrity. If existing key's read failed (per above), refuse write, force user to acknowledge corruption.

Multi-deep `.bak1` / `.bak2` / `.bak3` rotation is NOT implemented in v1 — IndexedDB storage tier is constrained on iOS, and the quarantine-on-failure pattern is the primary safety net. If multi-deep backup proves needed (post-dogfood), implement explicitly with versioned keys (`redact_list:v1`, `redact_list:v2`, ...) — not implicit `.bak1` rotation.

The pattern is logically equivalent to the lifecycle.ts writer-quarantine that landed in W5 (Day 5 of lean rebuild), adapted for the IndexedDB / web context.

承诺：web-app redact-list IO 继承 W5 commit `66863b0` 写者 quarantine 模式。读失败时复制损坏 blob 至 `<key>.corrupt.<ISO-timestamp>` IndexedDB key，记 ERROR + UI banner，绝不静默 `[]`。写时先读验，读失败的 key 拒写。多层备份不在 v1，需要时显式 `redact_list:v1/v2/...`。

### E4. E010 + E011 deploy + cache invalidation

**Status: ACK**

CellSentry session commits: CF Pages deploy script (`website/deploy.sh` or its successor for the unified app+marketing site) does **full file upload** on each release, not `_headers`-only or partial set-meta updates. The wrangler `pages deploy` invocation already uploads all files in the build output directory; this acknowledgment confirms no future "optimization" will introduce set-meta-only paths.

Cache invalidation: deploy script will explicitly purge cache for `/`, `/app`, `/app/`, `/app/index.html` on each release using CF API or wrangler command. Service Worker `cacheName` constant is bumped per release (matching the package.json version or git tag) so that:
- New SW activates on next visit and triggers cache refresh
- Old caches don't serve stale chunks alongside new ones
- User's browser doesn't accidentally pin to a deprecated app version

Post-deploy verification: `curl -I` against `cellsentry.pro/`, `cellsentry.pro/app/`, `cellsentry.pro/app/index.html` to verify each route returns the new chunk hashes; DevTools Application tab inspection to verify SW activated correctly. This is a manual checklist for now; can be automated in CI later.

承诺：CF Pages 部署全文件上传，非 `_headers`-only。每次发布显式刷 `/` / `/app` / `/app/` / `/app/index.html` 缓存。SW `cacheName` 每发布升版（匹 package.json version 或 git tag）。部署后用 curl + DevTools 验证。手工 checklist 暂时，可后续 CI 化。

---

## Sign-off / 签收

CellSentry session @ `~/Documents/cellsentry-dev` confirms:

- ✅ All 14 conditions (A1-A3 + B1-B3 + C1-C2 + D1-D2 + E1-E4) acknowledged as ACK.
- ✅ Zero deviations.
- ✅ Two reviewer pushbacks (Fast-mode rejection + ppu-paddle-ocr runtime-dependency rejection) understood as failure-mode-corrections, not architectural disagreements.
- ✅ Implementation green light per ADR-D38 § 9 is now active as of this commit timestamp.
- ✅ Phase 1 web skeleton work begins on `web` branch (already created from `af9c2f6` on 2026-04-29) immediately after this acknowledgement file is committed and pushed to origin.

Next action by CellSentry session: switch active dev to `web` branch, begin Phase 1 skeleton per ADR-D38 § 6 step 3-9 sequence.

Next action by DrCrow session: per ADR-D38 § 7 step 2, update PROJECT-BIBLE.md § 五 in follow-up commit. CellSentry session does not modify Bible.

CellSentry session @ `~/Documents/cellsentry-dev` 确认：
- ✅ 14 项约束全 ACK，无偏离。
- ✅ 两项反推认知为失败模式纠正，非架构分歧。
- ✅ 实施绿灯按 ADR-D38 § 9 自本提交时间戳起激活。
- ✅ Phase 1 web 骨架于本 ack 文件 commit + push 后立即在 `web` 分支启动。

CellSentry session 下一步：切到 `web` 分支，按 ADR-D38 § 6 step 3-9 顺序启动 Phase 1。
DrCrow session 下一步：按 ADR-D38 § 7 step 2 更 PROJECT-BIBLE.md § 五。CellSentry session 不动 Bible。

---

*End of acknowledgement note. Pushed to origin/main on this commit; DrCrow session may pull or read directly via absolute path.*

*确认笔记完。本提交推 origin/main；DrCrow session 可 pull 或经绝对路径直读。*
