<p align="center">
  <img src="assets/CellSentry.png" alt="CellSentry" width="128" height="128">
</p>

<h1 align="center">CellSentry</h1>

<p align="center">
  <strong>Intelligent Excel formula error detection</strong>
  <br>
  Catch formula bugs before they cost you money.
</p>

<p align="center">
  <a href="https://github.com/almax000/cellsentry/releases/latest"><img src="https://img.shields.io/github/v/release/almax000/cellsentry?style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/almax000/cellsentry/releases"><img src="https://img.shields.io/github/downloads/almax000/cellsentry/total?style=flat-square" alt="Downloads"></a>
</p>

---

## What is CellSentry?

CellSentry scans your Excel spreadsheets for formula errors using 23 audit rules across 7 categories. It runs entirely on your machine — your data never leaves your computer.

**Key features:**

- **23 audit rules** in 7 categories: consistency, references, logic, hardcoding, structure, style, complexity
- **Batch scanning** — drag & drop multiple files or folders
- **Confidence scoring** — each issue rated High / Medium / Low
- **Export reports** — HTML, PDF, or marked Excel files
- **Bilingual** — English and Chinese (i18n)
- **Cross-platform** — macOS (DMG) and Windows (Setup.exe)

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
│   ├── model/          # Model downloader
│   ├── report/         # HTML report generator
│   ├── excel/          # Excel cell marker
│   └── main/           # Electron main + IPC
├── src/                # Renderer (React)
│   ├── components/     # UI components
│   ├── i18n/           # Translations (EN/ZH)
│   └── hooks/          # React hooks
├── e2e/                # Playwright E2E tests
└── resources/          # App icons, DMG background
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
