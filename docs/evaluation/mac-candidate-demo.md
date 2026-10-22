# macOS candidate demo and visual acceptance

`scripts/record-mac-candidate.cjs` records a local macOS candidate through the packaged Electron executable. It takes the executable inside the app bundle as its only argument, rather than accepting a development build or a model path.

```sh
node scripts/record-mac-candidate.cjs \
  /absolute/path/CellSentry.app/Contents/MacOS/CellSentry
```

The recorder creates one new directory under `app/tmp/mac-rc-20261016/demo-run-*`. It leaves the source workbook untouched and stores the following local evidence there:

- a silent WebM recording, when Playwright video capture is available;
- English and Chinese Settings screenshots at a real 800 × 600 window size;
- audit, PII review and extraction screenshots from actual UI navigation;
- a PII confirmation-dialog screenshot, including the selected original and replacement values from synthetic data;
- marked-audit, redacted-PII, JSON and CSV exports, plus `receipt.json`.

The script starts the candidate with a unique `CELLSENTRY_TEST_USER_DATA` directory and an empty `CELLSENTRY_MODEL_DIR`. It enables `CELLSENTRY_TEST_MODE=1`, inherits the existing environment including proxy settings, and does not add or alter `LLAMA_SERVER`. The demo therefore exercises the packaged, rules-only path. It must not be described as evidence of local model accuracy.

The only native-operation substitution is deterministic: Electron’s open/save dialogs return paths for the synthetic golden fixture and the run-local export files. Scanning, switching all three result views, language selection, table inspection, the PII review confirmation, and exports all occur through visible UI clicks. After exports, the recorder reads the produced workbooks and data files back with ExcelJS/JSON/CSV checks, verifies the exact golden table range and content, confirms PII replacements, verifies audit notes, and checks that the source SHA-256 is unchanged. It also fails on renderer `pageerror` or failed requests.

The three-minute spoken walkthrough is an outline, not a claim that the recorded video lasts three minutes:

1. **0:00–0:35 — Scope and local boundary.** Open Settings, show the optional-model/rules-only status, resize to 800 × 600, and switch English to Chinese through the visible language selector. State that the workbook is a synthetic golden fixture and no model result is being demonstrated.
2. **0:35–1:15 — Formula audit.** Select the workbook through the normal file-selection flow, show the deterministic formula alerts and their locations, then export a marked copy. State that the original source remains unchanged.
3. **1:15–2:05 — PII review.** Open PII results, show selected findings and the 800 × 600 footer, open the native confirmation dialog, inspect original-to-masked replacements, and save a separate redacted copy.
4. **2:05–2:45 — Structured extraction.** Open extraction results, select the table range, show its source region, headers and the explicit note that the continuous range can include subtotal and total rows, then export JSON and CSV.
5. **2:45–3:00 — Evidence boundary.** Point to the receipt and read-back exports: they prove packaged UI flow, exports, source preservation and deterministic rule behavior. They do not prove model accuracy or cover arbitrary workbooks.

No video conversion occurs. The recorder records whether a system `ffmpeg` binary is available in `receipt.json`, but that check is not a prerequisite or proof that Playwright can capture video: Playwright uses its own bundled media tooling for `recordVideo`. If Playwright video capture is unavailable, the recorder currently fails; it does not yet provide an automatic screenshots-only fallback. Do not download a converter or add a dependency during candidate verification.
