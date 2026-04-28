<p align="center">
  <img src="assets/CellSentry.png" alt="CellSentry" width="128" height="128">
</p>

<h1 align="center">CellSentry <sup>BETA</sup></h1>

<p align="center">
  <strong>Local medical record pseudonymization. Strip names and identifiers before you send a record to AI.</strong>
  <br>
  Your medical records never leave your computer un-redacted.
</p>

<p align="center">
  <a href="https://github.com/almax000/cellsentry/releases/latest"><img src="https://img.shields.io/github/v/release/almax000/cellsentry?style=flat-square&label=beta" alt="Beta Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/almax000/cellsentry/releases"><img src="https://img.shields.io/github/downloads/almax000/cellsentry/total?style=flat-square" alt="Downloads"></a>
</p>

---

> ## ⚠️ v2 is a re-focus, not an upgrade
>
> CellSentry v1.x was a three-feature Excel toolbox (formula audit / PII redaction / data extraction). **v2 is a different tool** — a single-purpose medical record pseudonymization desktop app. v1.1.0-beta.1 still works and is permanently downloadable from the [v1 release tag](https://github.com/almax000/cellsentry/releases/tag/v1.1.0-beta.1). There is no migration path between them.
>
> The full pivot story: [cellsentry.pro/blog/v2-pivot](https://cellsentry.pro/blog/v2-pivot).

---

## What is CellSentry v2?

CellSentry v2 is a desktop app for Mac and Windows that lets you safely send medical records to AI services (Claude / ChatGPT / Gemini / etc.) by stripping personally identifying information **locally first** — before any data leaves your machine.

**You provide a mapping** of the strings you want pseudonymized — names, phone numbers, addresses, ID numbers, social-security numbers, employer names — paired with what each should be replaced with. CellSentry runs three local stages:

1. **Ingest** — plain text passes through; digital PDFs go through `pdf-parse`; DOCX through `mammoth.js`. Modern Chinese hospital records are overwhelmingly digital exports, so most inputs need no model download.
2. **Mapping** — literal `String.prototype.replaceAll`, longest-key-first ordering. Same person + same phone + same address always become the same pseudonyms across every document — that consistency is what makes follow-up questions to the AI useful.
3. **Regex fallback** — catches what your mapping missed: Chinese 18-digit ID (with GB 11643 checksum), mobile, email, Luhn-checked bank cards, plus label-anchored 病历号 / 医保号 / 就诊号. Runs after mapping, so user-supplied pseudonyms always win over fallback masks.

The redacted text comes out the other end and is automatically copied to your clipboard. Paste it into whichever AI you trust.

## Image input

By default, image OCR is **off**. Modern Chinese hospital records are digital PDFs / DOCX exports — those handle without a model download. For image input there are two paths:

- **Easy** — extract text using **macOS Live Text** or the **Windows OCR API**, both local and free, then paste into CellSentry. They're on par with our optional engine for standard printed Chinese.
- **Power-user** — set `CELLSENTRY_OCR_TIER=8bit` (or `bf16` / `4bit` / `ds-ocr-2`) and restart. PaddleOCR-VL 1.5 (Apache 2.0) downloads on next launch (1.10–1.82 GB depending on RAM tier).

Cloud OCR services are explicitly forbidden in the codebase — image data never leaves your machine.

## Download

> **Beta release** — expect rough edges. Please [report issues](https://github.com/almax000/cellsentry/issues) you encounter.

| Platform | Download |
|----------|----------|
| macOS | [CellSentry.dmg](https://github.com/almax000/cellsentry/releases/latest) |
| Windows | [CellSentry-Setup.exe](https://github.com/almax000/cellsentry/releases/latest) |

## Limitations + scope

- **Not HIPAA-compliant.** CellSentry is a personal local tool. No audit logging at the level a covered entity requires, no business associate agreement, no penetration testing. Clinicians handling patient PHI in a professional capacity should talk to their compliance lead.
- **CN-focused regex.** The validated regex pass covers Chinese identifiers (CN ID, mobile, 病历号 / 医保号 / 就诊号). Other locales work via your mapping but the regex fallback won't catch unmapped non-CN structured IDs.
- **No automatic name detection.** v2 deliberately does not auto-detect Chinese names — auto-NER misses 15-30% of them. The contract is: you list the strings you want redacted; CellSentry guarantees they're replaced consistently across all your documents.

## Build from source

```bash
git clone https://github.com/almax000/cellsentry.git
cd cellsentry/app
npm install
npm run dev
```

**Requirements:** Node.js 20+, npm. Optional: Python 3.10+ + `pip install -r requirements.txt` if you opt into image OCR.

### Build installers

```bash
# macOS
cd app && npm run build:mac

# Windows
cd app && npm run build:win
```

### Run tests

```bash
cd app && npm run typecheck     # Type checking
cd app && npm test              # Unit tests (vitest)
cd app && npx playwright test   # E2E tests (requires build first)
```

## Tech stack

- [Electron](https://www.electronjs.org/) — cross-platform desktop framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) — digital PDF text extraction
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) — DOCX text extraction
- (Optional) [mlx-vlm](https://github.com/Blaizzy/mlx-vlm) + [PaddleOCR-VL 1.5](https://huggingface.co/mlx-community/PaddleOCR-VL-1.5-bf16) — Apple Silicon image OCR when opted in

## Project structure

```
app/
├── electron/
│   ├── medical/             # Pseudonymization engine
│   │   ├── mapping/         # parser + builder + writer + literalReplace
│   │   ├── regex/           # CN-validated patterns
│   │   ├── pipeline/        # orchestrator (ingest → mapping → regex)
│   │   ├── ocr/             # OcrEngine abstraction + PaddleOCR-VL / DS-OCR-2 (opt-in)
│   │   └── audit/           # Append-only audit log
│   ├── llm/                 # Python subprocess bridge (only spawned when OCR is opted-in)
│   ├── model/               # Model downloader + RAM-tier selection
│   └── main/                # Electron main + IPC handlers
├── src/
│   ├── components/medical/  # IngestWorkspace + MappingEditor + AuditDiffViewer
│   └── i18n/                # EN + ZH-CN translations
├── e2e/                     # Playwright E2E tests
└── resources/               # App icons, DMG background
scripts/
└── llm_server.py            # OCR-only Python subprocess (opt-in)
```

## Feedback & community

- **Bug reports & feature requests** — [GitHub Issues](https://github.com/almax000/cellsentry/issues)
- **Questions & discussion** — [GitHub Discussions](https://github.com/almax000/cellsentry/discussions)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
