<p align="center">
  <img src="assets/CellSentry.png" alt="CellSentry" width="128" height="128">
</p>

<h1 align="center">CellSentry <sup>BETA</sup></h1>

<p align="center">
  <strong>An experimental local tool for spreadsheet formula audit</strong>
  <br>
  Audit formulas locally, inspect the source evidence, record your decision, and export a review report.
</p>

<p align="center">
  <a href="https://github.com/almax000/cellsentry/releases/latest"><img src="https://img.shields.io/github/v/release/almax000/cellsentry?style=flat-square&label=beta" alt="Beta Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://huggingface.co/almax000/cellsentry-model"><img src="https://img.shields.io/badge/%F0%9F%A4%97-Model-yellow?style=flat-square" alt="HuggingFace Model"></a>
  <a href="https://github.com/almax000/cellsentry/releases"><img src="https://img.shields.io/github/downloads/almax000/cellsentry/total?style=flat-square" alt="Downloads"></a>
</p>

---

> **Note**: CellSentry is an experimental project in active development. The source workspace focuses on formula audit and human review; PII redaction is moving to Vibli. The current downloadable beta remains a historical three-workflow build. The new audit workspace has not shipped in a public installer or Microsoft Store release.

Historical PII/extraction modules and their migration synthetic tests remain in the source tree; the active desktop flow is formula audit only.

<p align="center">
  <img src="assets/app-audit.png" alt="Unreleased audit workspace reviewing a synthetic quarterly expense workbook" width="1000">
</p>

## What is CellSentry?

CellSentry is a desktop app for local spreadsheet audit. Deterministic rules lead the analysis; an optional local formula-review model can assist with bounded review.

### Formula Audit

- **Deterministic checks** for supported formula, reference, type, and consistency problems
- **Batch scanning** — drag & drop multiple files or folders
- **Source evidence** — the original formula and saved workbook value; Excel is not recalculated
- **AI verification** — optional local LLM annotates findings; disputed findings remain visible and retain their rule confidence
- **Human review** — pending, confirmed, or not applicable, with local notes
- **Export reports** — HTML, PDF, or marked Excel files share the same review snapshot; confirmed-only reports disclose exclusions

### File support and result limits

- Input: `.xlsx` and `.csv`. Convert legacy `.xls` files before opening them.
- CSV imports preserve leading-zero IDs and long integer identifiers as text.
- Formula auditing reads formulas and cached values; CellSentry does not recalculate Excel formulas.
- Audit reports: HTML, actual PDF, and marked copies of `.xlsx` workbooks.
- Source-content and rule-evidence identities isolate old review decisions; a changed workbook must be scanned again.
- Marked copies may not preserve every complex Excel feature; keep the original workbook.
- The current public installer is an older three-workflow beta. Audit-only source changes do not mean a new installer has shipped.

## Download

> **Beta release** — expect bugs. Please [report issues](https://github.com/almax000/cellsentry/issues) you encounter.

| Platform | Download |
|----------|----------|
| macOS | [Apple Silicon RC.3 preview, unsigned](https://github.com/almax000/cellsentry/releases/tag/v1.1.0-beta.2-rc.20261023.3) |
| Windows | [Legacy Windows Beta installer](https://dl.cellsentry.pro/windows) |

## Offline macOS technical preview

The Apple Silicon offline preview contains the pinned MiniCPM5-2B formula-review model (1,561,314,592 bytes). Drag the app into Applications; first launch verifies and copies the model into the app's user-data directory. The separate lean update ZIP contains the program only and reuses an installed model. It is not a complete offline first-install download.

[Offline macOS RC.3 preview](https://github.com/almax000/cellsentry/releases/tag/v1.1.0-beta.2-rc.20261023.3)

This historical preview is unsigned and not notarized. It predates the new audit workspace shown above; the stable Latest release remains unchanged. Signature, Gatekeeper, and update behavior require validation for each new release.

## AI Model

- The current optional model is MiniCPM5-2B formula review v2, executed locally by bundled llama.cpp b11429 (Metal on Apple Silicon; CPU on other supported desktop targets).
- Its declared scope is formula review. The audit workspace does not run PII detection or redaction.
- The app opens and supports deterministic tools without a model. Remote model downloading remains disabled while distribution sources are being validated; approved local GGUF import is available in Settings.
- Import and runtime startup verify the pinned full SHA256. Settings reports the actual native runtime state.
- The older Qwen-based Hugging Face artifact is a historical release, not the current formula-review model.

## Build from Source

```bash
git clone https://github.com/almax000/cellsentry.git
cd cellsentry/app
npm install
npm run dev
```

**Requirements:** Node.js 20.19+ (CI uses Node.js 22), npm. Build each installer on its target platform so the native AI runtime matches the operating system and CPU.

### Build Installers

```bash
# macOS
cd app && npm run build:mac

# Windows
cd app && npm run build:win
```

### Run Tests

```bash
cd app
npm run test:ci  # Type checking, unit tests, build, real Electron E2E
```

## Tech Stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop framework
- [React](https://react.dev/) — UI components
- [TypeScript](https://www.typescriptlang.org/) — type-safe codebase
- [ExcelJS](https://github.com/exceljs/exceljs) — Excel file parsing
- MiniCPM5-2B formula-review v2 (GGUF); model provenance and licenses are in `model-artifacts/`
- [electron-vite](https://electron-vite.org/) — build tooling

## Project Structure

```
app/
├── electron/           # Main process
│   ├── engine/         # Rule engine (19 rules, 7 categories)
│   ├── pii/            # PII scanner (10 patterns, 2 locales)
│   ├── llm/            # Local LLM bridge (graceful degradation)
│   ├── model/          # Model downloader (HuggingFace)
│   ├── report/         # HTML report generator
│   ├── excel/          # Excel cell marker
│   └── main/           # Electron main + IPC
├── src/                # Renderer (React)
│   ├── components/     # UI components
│   ├── context/        # Scan state management
│   ├── i18n/           # Translations (EN/ZH)
│   └── hooks/          # React hooks
├── e2e/                # Playwright E2E tests
└── resources/          # App icons, DMG background
```

## Feedback & Community

- **Bug reports & feature requests** — [GitHub Issues](https://github.com/almax000/cellsentry/issues)
- **Questions & discussion** — [GitHub Discussions](https://github.com/almax000/cellsentry/discussions)
- **Updates** — [@almax000 on X](https://x.com/almax000)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
