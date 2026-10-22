# v2 local validation and model setup recovery - 2026-10-16

This record supersedes the missing-local-weight status in the earlier Mac RC acceptance. It does not supersede the earlier artifact's identity: the new installer below is a separate local candidate.

## Exact weights and candidate

The user-provided local file `cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf` is a real GGUF, 1,561,314,592 bytes. Its SHA-256 is `61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a`, matching the declared artifact at HF revision `ffaa261f5d7732848fb726dd15224035b8e63c8d`. Verification was recorded at `2026-10-16T19:48:08.994856Z`. No authentication material is stored in this record.

The new local Apple Silicon installer is version `1.1.0-beta.2-rc.20261016.2`, built from product commit `843826dad6f4cff073554677cba34159bf0cec47`:

- DMG: `tmp/mac-rc-20261016/staging/candidate-model-setup/CellSentry Beta-1.1.0-beta.2-rc.20261016.2-arm64.dmg`.
- Size: 132,580,280 bytes.
- SHA-256: `79ae19a96041589537079109c25abfec5a568c544448d64f5203a4d7e81b7179`.
- app.asar SHA-256: `11fe03656b456c26b47144008fc9ada3fb4507c447b92ae178959ec3695e0200`.
- All six compiled output files and 62 copied native runtime files match the package inventory.

It is not Developer ID signed, notarized, publicly uploaded, or a fresh-machine Gatekeeper acceptance. The DMG was copied and its executable tested locally. GGUF weights are not bundled. Source package.json was not changed; the candidate version is a packaging override.

## Product changes and verification

Model setup now distinguishes HTTP 401/403 access denial, 404 source unavailability and ordinary failures using typed transport metadata, not text matching. Rejected sources do not retry the same inaccessible location; a separately configured fallback may still be tried. Early response handling registers an error listener and aborts the actual Electron request after settling the typed result, including cancellation and valid 416 completion. Raw source URLs are not exposed as renderer diagnostics.

The localized modal names the expected GGUF and storage size. Access/source failures make local import primary; ordinary errors retain retry as primary. Import cancellation returns to a usable ready state. English and Chinese 800x600 screenshots were actually inspected.

| Check | Result | Scope |
| --- | --- | --- |
| Node + web TypeScript | Pass | Final product source |
| Unit tests | 99/99, 16 files | Includes download failure classification and request cleanup |
| Production build | Pass | Existing mixed static/dynamic excelReader import warning remains |
| Comparison runner/converter tests | 9/9 | Frozen input identity, provenance, role and counts |
| Focused source Electron | 16/16 | Core workflows, exports and setup failure recovery |
| Copied DMG Electron | 16/16 | Same focused checks on the packaged executable |
| Actual v2 native smoke | 9/9 | Startup, one synthetic formula response and cancellation |

The 16-check UI suites stub the download transport and OS file dialogs; actual renderer flows and exports execute. They do not prove public model downloading. The native v2 smoke uses the actual verified weights: startup 3942.044 ms, request 2137.857 ms, cancellation 945.604 ms. One accepted response is runtime/protocol evidence, not accuracy.

## Frozen comparison scope

The paired run uses the provided repository synthetic test at runner commit `8ba04edf4193f77b6461073841cbd3cadd954610`, not the missing historical external580 input:

- Original test JSONL SHA-256: `b62e79e66a1f15c90c08bcab0594abbde3d466a9b51ed0c26ff0661d9495b386`.
- Source manifest SHA-256: `b183ee94149dbd15a21b405ff491c2fe1dad04e98ab30902021ea4e1a83f68eb`.
- Converted input SHA-256: `f3574d19146900fb8ad4f545cc988f8f451cd47e10fe88e40ee9f8142610778f`.
- Role: `provided_synthetic_test`; 480 cases, 240 real-error and 240 false-alert labels, 12 categories, 240 counterfactual pairs.
- Old Qwen SHA-256: `4ae17b3886e4a5089671bf16aa133eaa6d8917a118bde6c75a54c1c3610f7cd3`.
- Each model uses its actual frozen runtime chat template. Common parameters: llama.cpp b11429, context 1024, max tokens 420, temperature 0, seed 42, parallel 1, arm64 GPU layers 99.

The prompt builder matches all 480 supplied user messages byte-for-byte; assistant targets, labels and oracle are not sent to inference. Responses append immediately with input hashes, raw completion, finish reason, protocol decision and latency. Source hashes and exact model/runtime identities are recorded. Runs are sequential, old Qwen first; performance is not randomized or thermally controlled.

The source manifest explicitly says synthetic context templates are shared across train/validation/test. Exact IDs, pair IDs, inputs and user prompts have no observed cross-split intersections, but that neither proves independent generalization nor rules out evaluation-driven development. Labels and oracle are supplied, not independently reviewed business truth. This run cannot reproduce the historical external580 comparison or certify real-world safety.

## Product applicability limits

Historical applicability analysis below describes the `.3` baseline. The following product wave adds observed workbook/rule evidence, bounded review and tokenizer preflight; its separate acceptance record will be linked from README. It does not inherit the frozen 480-case score as a score for the changed prompt.

Every provided test case supplies a short explicit business requirement or exception in `context`. The normal audit adapter currently passes rule/cell/sheet/formula/message/confidence and omits that context; native prompting substitutes an empty string. A high score here is conditional performance with supplied synthetic semantics, not equivalence to ordinary workbook scans. See [the scope audit](provided-test480-scope.md).

The runner evaluates one candidate per request, as does the current product lifecycle. However, the product's `analyzeWithLlm` accumulates judgments across those calls and returns only after every candidate; a response error throws out of that overall operation, after which the audit handler retains the deterministic result with an AI warning. Thus per-candidate protocol coverage is not automatically the same as workbook-level visible AI coverage. This fail-safe behavior preserves findings but can discard earlier valid review work in the same scan.

Before commit `25ebbc9`, the default GGUF was formula-specific while the shared native runtime also attempted PII and extraction modes. Those tasks require separate inputs, labels and quality metrics. Regex/template fallbacks and protocol gates protect some failure paths, but schema-valid results alone do not establish semantic correctness. Unified scan completion means at least one engine produced a result; it does not certify all three model calls.

The configured GitHub model release returned 404 for the authorized caller. That establishes inaccessible/absent-for-caller, not whether the release is private or missing. A logged-in HF download and local import do not prove normal public onboarding. A permitted, credential-free distribution path remains a release prerequisite.

Formula candidates are currently awaited one by one with `--parallel 1`. There is no audit candidate-count or whole-job time budget. A per-case median must not be advertised as workbook processing time. For illustration only, 2.2 seconds per candidate implies about 110 seconds for 50 or 440 seconds for 200, excluding startup and variability; these are arithmetic projections, not measured workbook timings. Before `25ebbc9`, PII batching and extraction could add work to that same queue, as they still can for explicitly multi-task runtimes; the default formula-only model now rejects those tasks before queueing. UI AI progress is presently coarse, rather than completed-candidate progress. Cancellation interrupts the active HTTP request, shuts down the child and uses an epoch to stop queued work; it still needs process/task settlement.

The next product work should therefore prioritize bounded review with visible unreviewed findings and real progress, traceable workbook/rule context with explicit unknown business requirements, and task-specific model applicability. This is preferable to adding unrelated functions before public onboarding and the existing workflows are dependable. Exact budgets remain product choices to calibrate, not validated safety thresholds.

## Local evidence locations

- `tmp/mac-rc-20261016/v2-local-file-verification.json`.
- `tmp/model-runtime-evidence-20261016/v2-native-smoke-2026-10-16T19-48-29.895Z.json`.
- `tmp/mac-rc-20261016/model-setup-package-inventory.json`.
- `tmp/mac-rc-20261016/model-setup-download-evidence.json` (failed attempts and later successful local verification retained).
- `app/tmp/e2e/model-setup-integration-20261016.log`.
- `app/tmp/e2e/model-setup-packaged-20261016.log`.
- `app/tmp/e2e/v2-native-smoke-20261016.log`.
- `tmp/formula-comparison-runner-20261016/provided480-paired-20261016-run1/` (frozen inputs, per-model responses, templates, run metadata and audits).

No public release, deployment, account creation, payment, telemetry change or external contact was performed. Existing source modifications and earlier failed evidence are retained.

## Completed paired result

Both 480-case runs completed on Apple M4 / 24 GiB RAM: old Qwen `2026-10-16T19:59:21.247Z` to `20:10:09.625Z`; v2 `20:10:10.627Z` to `20:27:17.734Z`. Independent tally and raw-response protocol replay both passed.

| Metric | Old Qwen | v2 |
| --- | ---: | ---: |
| Strict protocol accepted / 480 | 108 | 480 |
| Real errors retained / 240 | 60 | 240 |
| Unsafe withdrawal recommendations / 240 | 0 | 0 |
| False alerts correctly recommended for withdrawal / 240 | 0 | 200 |
| False alerts retained / 240 | 48 | 40 |
| Protocol failures preserving real errors / 240 | 180 | 0 |
| Protocol failures preserving false alerts / 240 | 192 | 0 |
| Accepted and agrees with supplied label / 480 | 60 | 440 |
| Median latency ms | 1280.131 | 2054.784 |
| p95 nearest-rank latency ms | 1821.882 | 2846.762 |

These are model recommendations; the product does not automatically withdraw findings. v2 agrees with supplied labels on 440/480 (91.67%) and recommends withdrawal on 200/240 labelled false alerts (83.33%). Neither ratio is a real-world accuracy or deployed false-positive reduction estimate. Of the 240 supplied counterfactual pairs, 200 have both sides accepted and label-consistent; 40 have at least one disagreement.

The 40 v2 disagreements are all preserved false alerts: rounding tolerance 20, optional blank 18, date direction 2. For example, a 0.01 difference explicitly allowed by a 0.02 tolerance is still flagged; an explicitly inactive row allowed to remain blank is also flagged. All 480 v2 outputs set adjustedConfidence=0.95, including the 40 disagreements. This value is not a calibrated probability. Repeated generic reasoning is not a cell-specific explanation. All disagreement inputs and raw outputs are saved in `v2-label-disagreements.jsonl`, with a three-category summary and examples in `v2-disagreement-summary.json`.

Old Qwen has 372 parser rejections (314 invalid judgment/identity, 58 wrong result shape). Nonexclusive field diagnostics found 201 rejected rows missing adjustedConfidence and 37 missing reasoning. A separate raw-boolean diagnostic has a boolean in 422/480 rows and label agreement in 266 of those; it has no identity guarantee and is not product accuracy. This separates output-contract compatibility from semantic claims about the old release.

## Actual packaged discovery and task-scope fix

The `.2` packaged real-model run `app/tmp/installed-model-regression/run-sEh8KH/receipt.json` completed the UI/export workflow, but exposed a semantic false positive: the plain header `PII Review!E1` / `Multiple emails` was labelled `email` by the formula model and offered as `ai-detected`. There were five regex findings plus this sixth AI finding. The audit had ten model-reviewed issues; extraction used its sufficient template result, not the model. Workflow success was therefore not accepted as a three-task model-quality pass.

Commit `25ebbc9` adds explicit default-model task metadata (`supportedTasks: ['audit']`). The production bridge passes it to the native runtime. Unsupported PII/extraction requests return before joining the serialized queue or starting/hashing/spawning/generating; their existing callers preserve regex/template results with an AI fallback warning. A loaded formula model remains globally available for audit. Generic/test runtimes without explicit metadata retain their previous modes. There is no filename guess or blanket disabling of all local models.

The new focused test proves unsupported tasks do not start/spawn and return even when the audit queue is blocked. TypeScript, all 103 tests in 17 files and the production build pass. The only build warning remains the existing mixed static/dynamic excelReader import. The 480-case comparison and its raw replay were completed before this scope-only native change at `8ba04ed`; they are not retroactively labelled as a benchmark of `25ebbc9`. Audit prompt, parser and generation parameters were not changed by the scope fix.

## Final .3 candidate acceptance

The final local candidate is `1.1.0-beta.2-rc.20261016.3`, product commit `25ebbc96c003ae131412fea157d080bf38d2064b`. DMG size is 132569849 bytes; SHA-256 `ddd2e7edc810fec1ea31fb543e44ef30559150594002c04dfea3bbb77a330339`. Copied app.asar SHA-256 is `f89594cf7f10187c2cd9b7697f0a2a478403e0f13ca6310546e2dd85328dc073`. Weights are not bundled; signing, notarization and publishing remain disabled.

The copied DMG executable passes all 16 focused package tests (`app/tmp/e2e/task-scope-packaged-20261016.3.log`). The final real-v2 workflow passes in `app/tmp/installed-model-regression/run-Nkt4mk/receipt.json`: ten audit findings receive model review; PII retains exactly five regex findings, no AI finding and an explicit unsupported-task warning visible as a localized fallback banner. Extraction returns five fields and one table from sufficient templates, without calling the model. Actual marked/redacted XLSX and extraction JSON/CSV exports were read back, and source workbook hash/invariants remained unchanged. No renderer failure was observed. The app and native process exited after testing.

This final run reuses a previously successful real model import from `run-NIKUqj`. Earlier failed harness attempts and the `.2` semantic false positive remain preserved; this is not represented as a single clean fresh-install run. A previous async-predicate waiting bug in the one-off harness was fixed to explicitly await both loaded states; the final script SHA is `3c2853735de95a4bd09b99c2b0723359af0e0e69b737c6459b57f50ecd6a7b3b`.

`tmp/mac-rc-20261016/task-scope-package-inventory.json` records artifact/native hashes and test scope. Main-agent independent checks in `task-scope-root-verification.json` confirm all six current compiled files match app.asar, the DMG hash matches and no root source/test/GGUF path is present. This remains a scoped content check, not a comprehensive dependency/secret audit. Screenshots of the final audit, PII and extraction views were actually inspected by the main agent.
