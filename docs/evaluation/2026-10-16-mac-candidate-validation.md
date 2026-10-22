# Mac candidate integration validation - 2026-10-16

This is a local candidate, not a published release. The integration branch is `codex/model-validation-20261016`; it merges private main `699be79606df46e09e7f9d003c7b24495689a066` and existing repairs `18489e87`, preserving both histories. Other worktrees were left intact.

## Implemented behavior

- Optional model setup: rules work without a model; download/import are explicit; model size/SHA and actual native load determine readiness. Failed imports preserve existing files.
- Native llama.cpp uses Electron `net` and inherits the configured networking environment. Startup, shutdown, cancellation, queued requests, abort/timeout settlement and identity checks are covered. No proxy bypass.
- Cancellation belongs to the initiating renderer and scan ID. The UI remains in a cancelling state until native inference and workbook work settle. It does not promise instant cancellation of an in-progress file parse. Renderer destruction triggers cancellation; model maintenance and scans are mutually exclusive. A failed stop retains the lock rather than allowing overlapping work.
- Model failure preserves deterministic findings and reports that AI review was not applied. AI disagreements remain review annotations; no automatic withdrawal gate is enabled. Model judgments are scoped by sheet/cell/rule and duplicate judgments are idempotent.
- Existing PDF, annotated workbook, redaction and extraction exports remain source-safe. Cancellation/write errors do not report success. Batch results retain source identity.
- Correct model/backend/version labels; remove single-edge highlight decorations on reviewed issue cards and sidebar items, retaining the existing design.

## Verification performed on Mac arm64

| Check | Observed result | Scope |
| --- | --- | --- |
| `npm run typecheck` | Node and web passed | Source typing |
| `npm run test:unit` | 74 passed, 11 files | File safety, session ownership, lifecycle, downloads, fallback |
| `npm run test:native` | 8 passed; 1 real-model test skipped | Protocol/lifecycle/import; no v2 model executed |
| Python `test_model_benchmark.py`, `test_audit_model_evidence.py`, `test_convert_archive_formula_eval.py` | 11 + 2 + 3 passed | Evaluator contracts, persisted arithmetic, traceable conversion |
| `npm run build` | Passed | Main, preload, renderer; existing non-blocking excelReader mixed-import warning |
| `npx playwright test` | 59 passed | Real Electron/IPC engines, isolated models/user-data, synthetic fixtures |
| After final CSS cleanup | 10 visual behavior checks passed; real UI screenshots captured/reviewed | Chinese settings, Chinese/English model setup, rules-only audit results |

The E2E file chooser is given a controlled fixture path; scanning and export use real engines. Cancellation uses a test-only ExcelJS read gate to reproduce cancelling during parsing. Screenshots are reviewed in addition to behavior assertions. Current desktop UI exposes light content with dark chrome, no alternate theme. No Windows or iOS run is claimed by this record.

The final build's tiny copy adjustment says AI review was not applied instead of calling optional-model absence an analysis failure. This was checked via fresh Electron screenshots; it does not change engine behavior.

## Real native runtime smoke: cached old model only

At `2026-10-16T16:34:03.402Z`, official llama.cpp b11429 on Mac arm64 successfully started with the existing cached Qwen 1.5B model, SHA256 `4ae17b3886e4a5089671bf16aa133eaa6d8917a118bde6c75a54c1c3610f7cd3`. Single-run startup: 13,794.64 ms; one request: 1,566.35 ms; cancellation: 940.35 ms. The output was rejected with `Invalid audit model response: Invalid audit judgment or identity`.

This verifies real startup, a request, rejection of incompatible output, and shutdown; it is not an accuracy pass and is not a v2 benchmark. No peak memory, p95, energy or thermal stability measurements were taken. A fair Qwen/v2 comparison needs each model's correct chat template and a common task/output contract.

## Model evidence and remaining blockers

The offline audit reproduced persisted v2 counts: 580 rows, 469 labelled real errors / 111 false alerts; raw withdrawal 65 correct + 21 unsafe; frozen-gate withdrawal 58 correct + 17 unsafe. The saved 17 unsafe IDs agree. Labels are developer-provided, not independently reannotated.

The original `.runtime/cancel2-external580.jsonl` has not been recovered. Visible v1 and v2 corpus hashes differ; the v1 70/119 run lacks traceable inputs/outputs. Do not claim matched relative improvement. See the [acceptance contract](model-evaluation-acceptance-contract.md), [missing-input manifest](external580-input-manifest.json), [new holdout specification](new-holdout-specification.md), and [conversion protocol](archive-conversion-protocol.md).

The v2 weight is not present on this Mac. Its authenticated browser download timed out; a subsequent tool path to inspect download state was safety-denied and was stopped. The configured automatic download asset was not verified accessible. A working authorized asset path and real v2 run are prerequisites for release. Do not embed access credentials or publish private model material without authorization.

No release, push, signing, notarization, Apple membership purchase, App Store submission, IAP or telemetry change was performed. Historical Windows/iOS validation in `native/VALIDATION.md` refers to the collaborator's earlier revision, not automatic revalidation of this candidate.
