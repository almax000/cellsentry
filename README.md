<p align="center">
  <img src="assets/CellSentry.png" alt="CellSentry" width="128" height="128">
</p>

<h1 align="center">CellSentry</h1>

<p align="center">
  <strong>Local AI toolbox for spreadsheets</strong>
  <br>
  Audit formulas, detect PII, and extract structured data — your data never leaves your machine.
</p>

<p align="center">
  <a href="https://github.com/almax000/cellsentry/releases/latest"><img src="https://img.shields.io/github/v/release/almax000/cellsentry?style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/almax000/cellsentry/releases"><img src="https://img.shields.io/github/downloads/almax000/cellsentry/total?style=flat-square" alt="Downloads"></a>
</p>

---

## What is CellSentry?

CellSentry is a desktop app that scans your Excel spreadsheets for formula errors, sensitive data, and structured information — all running locally on your machine. No cloud, no uploads, no data leaks.

### Formula Audit

- **23 audit rules** in 7 categories: consistency, references, logic, hardcoding, structure, style, complexity
- **Batch scanning** — drag & drop multiple files or folders
- **Confidence scoring** — each issue rated High / Medium / Low
- **AI verification** — optional local LLM confirms or dismisses findings (graceful degradation when unavailable)
- **Export reports** — HTML, PDF, or marked Excel files

### PII Detection

- **12 regex patterns** across 4 locales (US, CN, EU, generic)
- Detects: SSN, phone numbers, email, national IDs, credit cards, IBAN, passport numbers
- **Validators**: Luhn algorithm (credit cards), CN ID checksum
- **Masking preview** — see redacted values before exporting
- Cell-level highlighting with confidence scores

### Data Extraction

- **5 document types**: invoice, receipt, purchase order, expense report, payroll
- **Multilingual templates** — English and Chinese header matching
- Field extraction: invoice number, date, vendor, totals, line items
- **Table detection** — automatic header/row identification
- **Export**: JSON or CSV structured output

## Download

Get the latest release for your platform:

| Platform | Download |
|----------|----------|
| macOS | [CellSentry.dmg](https://github.com/almax000/cellsentry/releases/latest) |
| Windows | [CellSentry-Setup.exe](https://github.com/almax000/cellsentry/releases/latest) |

## Build from Source

```bash
git clone https://github.com/almax000/cellsentry.git
cd cellsentry/app
npm install
npm run dev
```

**Requirements:** Node.js 20+, npm

### Build Installers

```bash
# macOS
cd app && npm run build:mac

# Windows
cd app && npm run build:win
```

## Tech Stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop framework
- [React](https://react.dev/) — UI components
- [TypeScript](https://www.typescriptlang.org/) — type-safe codebase
- [ExcelJS](https://github.com/exceljs/exceljs) — Excel file parsing
- [electron-vite](https://electron-vite.org/) — build tooling
- [electron-updater](https://www.electron.build/auto-update) — auto-updates

## Project Structure

```
app/
├── electron/           # Main process
│   ├── engine/         # Rule engine (23 rules, 7 categories)
│   ├── pii/            # PII scanner (12 patterns, 4 locales)
│   ├── extraction/     # Document extractor (5 doc types)
│   ├── llm/            # Local LLM bridge (graceful degradation)
│   ├── model/          # Model downloader
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

## AI Verification (Optional)

CellSentry includes an optional local LLM that verifies rule engine findings. The AI layer:

- Runs entirely on your machine (MLX on Mac, llama.cpp on Windows)
- Downloads a 920MB model on first use
- Confirms or dismisses rule engine findings with reasoning
- **Gracefully degrades** — all three features work perfectly without the model

## Feedback & Community

- **Bug reports & feature requests** — [GitHub Issues](https://github.com/almax000/cellsentry/issues)
- **Questions & feedback** — [@almax000 on X](https://x.com/almax000)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
