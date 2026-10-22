# Bounded audit review — 2026-10-16 development wave

## Product behavior and evidence boundary

The audit adapter now sends bounded evidence from the actual originating worksheet: source sheet/cell, observed scalar values, formula cached values explicitly marked not recalculated, a few simple local references or immediate neighbors, and rule-derived suggestions explicitly marked as such. Business requirements are declared unknown. The small parser handles supported simple local A1 references and conservatively omits recognized qualified/structured shapes. It is not a complete Excel reference parser; arbitrary complex-workbook behavior is not accepted. A final review also found and fixed a 3D qualifier ambiguity, described below. Quoted strings are excluded from A1 lookup. Evidence is data, not an instruction. This does not make the model an independently grounded financial adviser or prove resistance to arbitrary workbook prompt injection.

The evidence character cap is 480; it is not a token guarantee. The actual native chat template is applied with thinking disabled, then tokenized. An audit prompt must fit `input tokens + 420 output reserve + 32 margin <= 1024`. An oversized or malformed preflight does not issue a completion and leaves the deterministic finding available. Formulas and identity are not truncated to force them to fit. The initial byte cap is an abuse guard, separate from token accounting. The API implementation was checked against the pinned [llama.cpp b11429 server documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/b11429/tools/server/README.md) on 2026-10-16 Pacific time; actual-runtime evidence is recorded below.

A scan selects at most 20 audit findings, ordered by rule severity with stable original-order ties. Its review budget is 60 seconds including lazy startup. These are provisional product defaults to calibrate from task completion and latency, not empirically justified safety thresholds. Process shutdown/settlement may extend wall-clock completion past the deadline; 60 seconds is not an end-to-end workbook SLA. Reading, deterministic engines, UI and export also take time.

Each accepted, identity-valid response is retained if a later candidate fails. Agreement and disagreement both count as reviewed; no judgment deletes an original rule finding. Progress and result summaries state total, selected, attempted, reviewed, failed, skipped and stop reason. `attempted = reviewed + failed`, `skipped = total - attempted`; the visible unreviewed count is `total - reviewed` and therefore includes failed attempts. A missing model stops after the first unavailable result rather than repeatedly starting it. An empty rule result does not imply a safe workbook.

Cancellation stops actual native work, invalidates queued work and prevents stale results/progress from attaching to another scan. Deadline stop failure retains the backend lock and the renderer scan identity until the user can retry stopping. A process error with a PID is not treated as observed exit. Batch files have separate scan identities; switching invalidates the old loop before awaiting cancellation. CPU regressions cover the old response arriving before and after a failed stop acknowledgement.

The default v2 model remains formula-audit only. PII keeps deterministic regex handling and a visible unsupported-task fallback; extraction uses sufficient templates on the golden fixture. No claim of improved PII or extraction model accuracy is made.

## Accuracy applicability

The previous 440/480 label agreement belongs to the frozen provided-synthetic comparison at source `8ba04ed`, with explicit synthetic business requirements. This wave changes ordinary workbook context and runtime preflight; it has not rerun a new independent accuracy benchmark. Runtime compatibility, candidate limits, counters and successful exports are functional evidence, not measured semantic accuracy. The original external580 inputs remain unavailable. The model's repeated 0.95 score is not calibrated confidence.

## Verification receipts

Acceptance results, artifact identity and limitations are appended after actual execution. No release, model redistribution, telemetry, remote deployment, account purchase or public announcement is authorized by this local validation.


## Intermediate .4 candidate acceptance

Product source: `1283e7a1391c0c6f8f4d9f3af12b7c62af52b3b9`; version `1.1.0-beta.2-rc.20261016.4`. Source package.json version is unchanged; candidate packaging overrides it. The subsequent version-test correction and this documentation do not change shipped product code.

- DMG: `tmp/mac-rc-20261016/staging/candidate-audit-review/CellSentry Beta-1.1.0-beta.2-rc.20261016.4-arm64.dmg`.
- Size: 132,603,911 bytes; SHA-256 `d6ac942abe8eb94b503b0c7388034f0998ea63b3dd4b5cf246e702be201d09c6`.
- app.asar SHA-256: `88f5f682c4cf55f68f0e66d56443f31c5fbf83ec758a577fa55eeee1ef07aded`.
- Main-agent independent verification: six compiled output files, 44 native regular files and 18 symlink targets match current source/prepared runtime. The runtime inventory has 63 total entries including its directory. No GGUF or root source/test paths were observed in app.asar. This is a scoped content check, not a complete dependency/secret audit.

| Check | Observed result | Scope |
| --- | --- | --- |
| Node/web TypeScript + production build | Pass | Existing mixed static/dynamic excelReader warning remains |
| Unit suite | 138/138 in 22 files | Includes stop failure response ordering in the real ScanProvider async closures |
| CPU native suite | 8 pass, 1 opt-in skip | Real model exercised separately below, not counted as a CPU-suite pass |
| Source new Electron tests | 3/3 | Controlled IPC 80 findings, partial successes and stop retry; not model accuracy |
| Copied DMG Electron suite | 28/28 | Functional + export projects, including three new controlled-review tests |
| Actual v2 native smoke | Startup, identity-valid response and cancellation pass | Cancellation about 934 ms, one run, not p95 |
| Actual template/tokenizer | 455-char evidence, 341 input tokens, identity-valid response | One representative rule-derived case, about 1.49 s |
| Actual oversize preflight | 12,001-byte formula -> 8,337 input tokens -> no completion | Separate 80,001-byte formula rejected by payload guard; identity/formula not truncated |
| Actual bounded scheduler | 60 input copies, 20 selected/attempted/reviewed, 0 failed, 40 skipped | 21.917 s for repeated copies of one actual rule finding; not 60 independent cases |
| Actual copied app + local v2 workflow | Pass | Ten audit reviews, five deterministic PII findings, five template fields and one table; exports read back |

The final workflow is `app/tmp/installed-model-regression/run-DJqhIG/receipt.json`. The ten audit responses all agree with the rules. This is 10/10 protocol coverage, not 10/10 semantic accuracy; there are no independent business labels for those ten findings. All-agreement also does not demonstrate false-positive reduction. PII never accepts formula-model detections and reports a visible unsupported-task fallback. Extraction completes via sufficient templates. The source workbook hash is unchanged; marked and redacted XLSX plus JSON/CSV were read back. No renderer failure was observed. The harness reuses the previous isolated real import (`run-NIKUqj`), so this is not a new-user download/fresh-install proof.

## Preserved failure history

The packaging/version failures in this section belong to the intermediate `.4` stage, not to a claim that the final `.5` had failed.

The first native scheduler probe used the wrong isolated model resolution and returned unavailable. Its immutable receipt is retained as `tmp/audit-budget-20261016/audit-budget-model-path-attempt.json`; the corrected harness then exercised the actual production bridge using the local artifact. The original successful probe retained a mutable transportCalls array, so later overflow calls also appeared under the representative entry. `receipt-normalization.json` identifies the representative call indexes 2–4 without rewriting the original receipt. A future-harness snapshot fix was not rerun. `source-hash-manifest.json` binds source and receipts and states that limitation.

The initial sandbox electron-builder DMG step failed at `hdiutil create` with exit 1 after six automatic retries and no additional diagnostic; no tool safety rejection was reported. A host-executed DMG-only resume used the already packaged app, inherited existing proxies, and succeeded. It was mounted read-only, copied with ditto and detached. The first packaged suite had 27 passes and one stale version assertion: it expected beta.1 although the UI correctly showed `.4`. The test now checks the exact actual `app.getVersion()`; a focused pass and the complete 28-pass rerun followed. The first failure screenshot/error context/report were copied before rerunning. Earlier installers and evidence remain intact.

## Evidence and remaining gates

- `tmp/audit-budget-20261016/integration-checks.json` summarizes completed terminal checks; raw outputs are retained in the task.
- `tmp/audit-budget-20261016/audit-budget-result.json` and its Electron harness record actual endpoint calls, tokenizer counts, default-budget behavior and shutdown.
- `tmp/audit-budget-20261016/receipt-normalization.json` and `source-hash-manifest.json` document call attribution and hashes.
- `tmp/mac-rc-20261016/audit-review-package-inventory.json` and `audit-review-root-verification.json` record package identities and root comparisons.
- `app/tmp/e2e/audit-review-packaged-20261016.4-attempt2.log` contains the final 28-pass package run; the first log and `tmp/mac-rc-20261016/audit-review-first-failure/` preserve the earlier version failure.
- `app/tmp/e2e/audit-budget/controlled-ui-BbMxz1/` contains final packaged English/Chinese 800x600 screenshots; the main agent actually inspected the progress, result denominator and retry states.
- `app/tmp/installed-model-regression/run-DJqhIG/` contains the actual model receipt, screenshots and exports. The main agent inspected the audit, PII and extraction screenshots.

Before a public product release, verify a permitted credential-free model source, real normal startup/onboarding and independently labelled workbook tasks using the new observed-evidence context. The configured model source previously returned 404 for an authorized caller; that is historical access evidence, not a refreshed availability check. Signing/notarization, fresh-machine Gatekeeper, Windows, iOS, dark mode and arbitrary complex workbooks are not accepted here. The application is currently light-only. No purchase, public release, remote deployment, telemetry change or user contact occurred. The retained local HTML is updated in place; its prior file:// safety refusal was respected, so HTML structural checks are distinguished from the actually inspected Electron screenshots.


## Final .5 acceptance after the 3D evidence correction

Independent review identified a false-provenance edge case: `=SUM(A1:B1!C3)` could classify `A1` as a current-sheet reference after partially masking the qualified expression. Product commit `d87cff2dee9e75f87489a928e46400915c054bdb` now conservatively omits all local-reference guesses for recognized ambiguous 3D qualifiers, including the quoted form and mixed expressions. The known counterexamples were independently replayed with the real helper. This does not claim a complete Excel reference parser.

The final recommended local candidate is `1.1.0-beta.2-rc.20261016.5`:

- DMG: `tmp/mac-rc-20261016/staging/candidate-audit-review-final/CellSentry Beta-1.1.0-beta.2-rc.20261016.5-arm64.dmg`.
- Size: 132,585,220 bytes; SHA-256 `e0586ad1e764a418807a08c032edc25e165942326fbf2082fce060f347b43aa8`.
- app.asar SHA-256 `8e2a004b03fda599b232a3014091e6de839d86c3514e8f156996d5c7958684e5`.
- Final type checks, 139/139 unit tests in 22 files, and production build passed.
- Host packaging succeeded; the DMG was mounted read-only, copied and detached. Final copied-app functional/export suite passed 28/28 in 53.8 seconds, including exact runtime-version display.
- The final actual-v2 workflow is `app/tmp/installed-model-regression/run-eBBGWK/receipt.json`; packaged identity confirms `.5`, isolated prior import reuse, llama.cpp and the correct copied executable. Audit completed 10/10 identity-valid reviews (all agree; not independent accuracy); PII retained five regex findings and its fallback; extraction returned five fields and one table. Actual exports and unchanged-source invariants passed; renderer failures are empty. The app/native runtime closed after the run.
- Main-agent independent comparisons in `tmp/mac-rc-20261016/audit-review-final-root-verification.json` confirm all six current compiled files, 44 native files and 18 symlink targets match. No root source/tests/GGUF were found in the package's scoped content check.
- Final packaged controlled screenshots are `app/tmp/e2e/audit-budget/controlled-ui-FaiNuj/`; real screenshots/exports are in `run-eBBGWK`. The main agent inspected final audit/PII/extraction, partial-review denominator, progress and stop-retry screenshots.

`tmp/audit-budget-20261016/final-source-binding.json` records the difference between this final source and the earlier real direct template/tokenizer/scheduler probe at `1283e7a`. The native runtime, lifecycle, bridge and rule adapter hashes are unchanged. The evidence helper differs by the 3D omission guard; its CPU regression and final golden-workbook workflow pass. The 341-token, 8,337-token and 21.917-second direct measurements remain measurements of the earlier explicit source, not falsely relabelled as a rerun on `.5`. The frozen 480-case accuracy comparison likewise remains historical.

Final artifacts: `audit-review-final-package-inventory.json`, `audit-review-final-root-verification.json`, `audit-review-final-delivery-checks.json`, and `app/tmp/e2e/audit-review-packaged-20261016.5.log`. Earlier `.4` artifacts, successes, failures and corresponding root checks remain preserved. Signing, notarization, public publishing and all remaining gates above are unchanged.
