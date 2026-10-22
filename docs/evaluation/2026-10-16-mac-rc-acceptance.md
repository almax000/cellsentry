# macOS local candidate acceptance — 2026-10-16

## Result and exact artifact

The local Apple Silicon candidate completes formula audit, selected PII redaction and structured extraction through the packaged application. It is **not a public release**, model-quality certification, Developer ID signed build or notarized installer.

- Source commit: `1c4b0e318aea1f41016e69e2ae694615525083c7`.
- Local package version: `1.1.0-beta.2-rc.20261016`. Source package.json remains `1.1.0-beta.1`; this identifier is a build metadata override, not CellSentry 2.
- Inventory captured: `2026-10-16T19:14:28.438Z`.
- DMG: `tmp/mac-rc-20261016/staging/candidate-final/CellSentry Beta-1.1.0-beta.2-rc.20261016-arm64.dmg`.
- DMG bytes: `132577749`; SHA-256: `23ea4a6420d2db8cdb0d1c9f88e64ffbdeb9780f260ef73894cc63fc9bd57968`.
- app.asar SHA-256: `3ffe19981253ecbf11b2bee1215e1eff6131fceb533fb41c48a31345b45d8691`.
- Packaged Electron 40.8.0, macOS arm64; native runtime b11429, commit `d81235049`.

The final app.asar matches all six current compiled output files byte-for-byte. The copied application has the same asar and native runtime hashes. Package inventory excludes root source/test/tmp folders, old output backups and GGUF weights. This is a scoped package-content check, not a comprehensive secret scanner. Runtime `--version` executes from the copied bundle; it does not prove model loading.

## Product changes

Formula audit separates rule findings, AI agreement/disagreement and unreviewed status, with reviewed counts instead of uncalibrated confidence percentages. Rule findings remain visible when AI disagrees. Expanded cards identify the source worksheet/cell; copy-reference now performs the action instead of displaying an inert control. Empty results no longer imply the whole workbook is safe.

PII review requires a nonempty selection and shows original → replacement values before creating a separate workbook. Unselected findings are preserved. An in-flight guard prevents duplicate exports. Pattern detection and AI suggestions have explicit provenance, not apparent accuracy scores.

Extraction shows source cells, headers and the exact contiguous export range. It warns that the range can include subtotal/total rows. It does not claim line-item segmentation. Preview navigation follows sheets and distant cells, returns to the same source after manual tab switches, and handles batch file switches without stale sheet state.

The renderer uses local system fonts; remote Google Fonts links were removed after a packaged regression caught their CSP failure. Settings language now synchronizes to rule execution before single-file and batch scans. Existing results keep their original language; a rescan generates new explanations.

Native audit parsing accepts the cached legacy model's exact request-matching display aliases, but rejects wrong cell/rule/worksheet identities. Explicit contradictory sheetName is rejected. Log paths resolve after profile isolation. Automatic rule-alert withdrawal remains disabled.

## Verification and failures preserved

| Layer | Result | Scope |
|---|---|---|
| TypeScript | Node + web pass | Final product source |
| Unit tests | 88/88 in 15 files | Protocol, state, export, parsing and locale checks |
| Native runtime | 9/9 | Includes one real cached old-Qwen smoke; not v2 accuracy |
| Source Electron suite | 64 passed; 1 test-entry failure | New locale test triggered from Settings and never navigated; test changed to Home + Browse |
| Corrected focused Electron suite | 3/3 | Source navigation, batch identity, Chinese/English real rescan |
| Final DMG copied application | 13/13 | Golden workflows, selected redaction, localization, batch identity, PDF/HTML/XLSX/JSON/CSV exports, cancellation/failure feedback |
| Final demo | 62.60 seconds | Actual packaged executable, EN/ZH 800×600 and 1200×750; screenshots visually inspected |

Earlier rounds caught two real defects (online font fetch; language mismatch) and two incorrect test-entry assumptions. Their records remain; the final acceptance does not present those failed rounds as clean passes. The source suite was not re-run in full after fixing the final test entry; the focused group and all 13 package checks passed with unchanged product source.

The DMG was mounted read-only, copied with ditto into project-local `installed-final/`, then the executable inside that copy was launched. No /Applications replacement, quarantine removal, Gatekeeper bypass or OS reconfiguration was used. The mount was detached after checks. This is a copy-and-run acceptance on the current machine, not a fresh macOS installation or a downloaded-quarantine Gatekeeper acceptance.

Packaged tests use `CELLSENTRY_TEST_MODE=1`, isolated user data and an empty model directory. They skip automatic updater initialization and model warmup. OS open/save dialogs return deterministic fixture paths; actual application scanning, UI review and exports run normally. The recorder checks renderer events after listeners attach, not all main-process/network activity. No claim of zero network traffic or full offline network simulation is made.

## Reproduction and evidence

```sh
cd app
npm run typecheck
npm run test:unit
npm run build
CELLSENTRY_E2E_APP='/absolute/path/CellSentry Beta.app/Contents/MacOS/CellSentry Beta' \
  npx playwright test --project=functional --project=exports \
  e2e/golden-functional.spec.ts e2e/review-functional.spec.ts e2e/export-roundtrip.spec.ts
```

Local evidence, relative to this worktree:

- `tmp/mac-rc-20261016/acceptance-summary.json`: summarized checks and explicit limits.
- `tmp/mac-rc-20261016/final-package-inventory.json`: package/runtime hashes, exact paths and source-build equality.
- `app/tmp/e2e/final-source-20261016.log`: full source run including the test-entry failure.
- `app/tmp/e2e/final-review-20261016.log`: corrected 3-test run.
- `app/tmp/e2e/final-packaged-20261016.log`: final 13/13 run from DMG copy.
- `app/tmp/mac-rc-20261016/demo-run-uDBMPs/`: six screenshots, WebM, JSON receipt and real exports.
- `app/e2e/fixtures/golden-three-workflows.xlsx`: synthetic source; SHA-256 `34578166728fc9ce4873ac5d1b15de4bbf9a651f167e41b1eec28e4d8152fd3d`.

See [recording instructions](mac-candidate-demo.md) and [runtime evidence](model-runtime-followup-2026-10-16.md).

## Remaining release and model gates

The user-provided Hugging Face GGUF exists at pinned revision `ffaa261f5d7732848fb726dd15224035b8e63c8d`, size 1,561,314,592 bytes, declared SHA-256 `61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a`. The download timed out without returning a local file; this was not a missing URL. No v2 local hash or inference is claimed.

The GGUF is hosted in a partner's Hugging Face repository that is not public; the revision and SHA-256 above identify it.

The app's configured model download is an access-restricted GitHub Release, not a validated public onboarding path. Before public distribution, obtain and validate the exact weights, resolve model distribution/licensing, run a frozen rules/old-model/v2 comparison, and validate ordinary startup, model setup, signing/notarization and Gatekeeper behavior. Windows and iOS require their own evidence. Existing external580 inputs remain missing; new holdout results cannot be presented as a reproduction of that historical report.
