<p align="center">
  <img src="assets/CellSentry.png" alt="CellSentry" width="128" height="128">
</p>

<h1 align="center">CellSentry <sup>BETA</sup></h1>

<p align="center">
  <strong>An experimental local AI toolbox for spreadsheet analysis</strong>
  <br>
  Audit formulas, detect PII, and extract structured data — your data never leaves your machine.
</p>

<p align="center">
  <a href="https://github.com/almax000/cellsentry/releases/latest"><img src="https://img.shields.io/github/v/release/almax000/cellsentry?style=flat-square&label=beta" alt="Beta Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://huggingface.co/almax000/cellsentry-model"><img src="https://img.shields.io/badge/%F0%9F%A4%97-Model-yellow?style=flat-square" alt="HuggingFace Model"></a>
  <a href="https://github.com/almax000/cellsentry/releases"><img src="https://img.shields.io/github/downloads/almax000/cellsentry/total?style=flat-square" alt="Downloads"></a>
</p>

---

> **Note**: CellSentry is an experimental research project in active development. The optional formula assistant uses a fine-tuned local model; PII redaction and extraction retain their rule/template paths. Feedback and contributions welcome.

<p align="center">
  <img src="assets/app-dropzone.png" alt="Drop zone — drag and drop spreadsheets" width="700">
</p>
<p align="center">
  <img src="assets/app-audit.png" alt="Formula Audit — detect errors with confidence scoring" width="700">
</p>
<p align="center">
  <img src="assets/app-pii.png" alt="PII Detection — find and redact sensitive data" width="700">
</p>
<p align="center">
  <img src="assets/app-extraction.png" alt="Data Extraction — structured field and table extraction" width="700">
</p>

## What is CellSentry?

CellSentry is a desktop app that explores using local small language models (SLMs) for spreadsheet intelligence tasks. It provides three analysis modes, with deterministic rules and an optional local formula-review model:

### Formula Audit

- **19 audit rules** in 7 categories: consistency, references, logic, hardcoding, structure, style, complexity
- **Batch scanning** — drag & drop multiple files or folders
- **Confidence scoring** — each issue rated High / Medium / Low
- **AI verification** — optional local LLM annotates findings; disputed findings remain visible and retain their rule confidence
- **Export reports** — HTML, PDF, or marked Excel files

### PII Detection

- **10 regex patterns** across 2 locales (US, CN)
- Detects: SSN, phone numbers, email, national IDs, credit cards, IBAN, passport numbers
- **Validators**: Luhn algorithm (credit cards), CN ID checksum
- **Masking preview** — see redacted values before exporting
- Cell-level highlighting with confidence scores

### Data Extraction

- **5 document types**: invoice, receipt, purchase order, expense report, payroll
- **Bilingual templates** — English and Chinese header matching
- Field extraction: invoice number, date, vendor, totals, line items
- **Table detection** — automatic header/row identification
- **Export**: JSON or CSV structured output

### File support and result limits

- Input: `.xlsx` and `.csv`. Convert legacy `.xls` files before opening them.
- CSV imports preserve leading-zero IDs and long integer identifiers as text.
- Formula auditing reads formulas and cached values; CellSentry does not recalculate Excel formulas.
- Audit reports: HTML, actual PDF, and marked copies of `.xlsx` workbooks.
- PII exports create a separate `.xlsx` copy of the selected findings. Verify the preview before sharing any redacted file.
- Extraction exports save structured JSON or CSV; CSV text is escaped against spreadsheet formula injection.

## Download

> **Beta release** — expect bugs. Please [report issues](https://github.com/almax000/cellsentry/issues) you encounter.

| Platform | Download |
|----------|----------|
| macOS | [CellSentry.dmg](https://github.com/almax000/cellsentry/releases/latest) |
| Windows | [CellSentry-Setup.exe](https://github.com/almax000/cellsentry/releases/latest) |

## Offline macOS technical preview

The Apple Silicon offline preview contains the pinned MiniCPM5-2B formula-review model (1,561,314,592 bytes). Drag the app into Applications; first launch verifies and copies the model into the app's user-data directory. The separate lean update ZIP contains the program only and reuses an installed model. It is not a complete offline first-install download.

[Offline macOS preview](https://github.com/almax000/cellsentry/releases/tag/v1.1.0-beta.2-rc.20261023.1)

This preview is unsigned and not notarized; Gatekeeper approval and automatic update installation have not been validated. Initial local preparation took about 23 seconds before the window appeared. The stable Latest release remains unchanged.

## AI Model

- The current optional model is MiniCPM5-2B formula review v2, executed locally by bundled llama.cpp b11429 (Metal on Apple Silicon; CPU on other supported desktop targets).
- Its declared scope is formula review. PII redaction and data extraction use rules/templates; this model is not a validated PII model.
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
- [Qwen2.5-1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B) — base model for AI features
- [electron-vite](https://electron-vite.org/) — build tooling

## Project Structure

```
app/
├── electron/           # Main process
│   ├── engine/         # Rule engine (19 rules, 7 categories)
│   ├── pii/            # PII scanner (10 patterns, 2 locales)
│   ├── extraction/     # Document extractor (5 doc types)
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
