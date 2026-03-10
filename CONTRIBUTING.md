# Contributing to CellSentry

Thanks for your interest in contributing! CellSentry is an open source Excel formula error detection tool.

## Getting Started

```bash
# Fork and clone
git clone https://github.com/<your-username>/cellsentry.git
cd cellsentry/app

# Install dependencies
npm install

# Start development
npm run dev
```

## Verify Your Changes

Before submitting a PR, make sure your changes build and pass type checks:

```bash
cd app
npm run build        # Build with electron-vite
npm run typecheck    # TypeScript type check
```

## What to Contribute

### Adding Audit Rules

Audit rules live in `app/electron/engine/rules/`. Each rule file exports functions that detect specific formula issues.

**Categories:**
- `consistency.ts` — inconsistent formulas in ranges
- `references.ts` — broken or suspicious references
- `logic.ts` — logical errors in formulas
- `hardcoding.ts` — magic numbers, hardcoded values
- `structure.ts` — structural issues
- `style.ts` — naming and formatting
- `complexity.ts` — overly complex formulas

To add a new rule:
1. Add your detection function to the appropriate category file
2. Register it in `app/electron/engine/registry.ts`
3. Add i18n strings in `app/src/i18n/locales/{en,zh}/`

### Adding Translations

Translation files are in `app/src/i18n/locales/`. Each language has namespace JSON files:

```
app/src/i18n/locales/
├── en/
│   ├── common.json
│   ├── modals.json
│   ├── results.json
│   └── settings.json
└── zh/
    ├── common.json
    ├── modals.json
    ├── results.json
    └── settings.json
```

To add a new language, create a new directory (e.g., `ja/`) with the same JSON structure.

### Bug Fixes and Improvements

- Check [open issues](https://github.com/almax000/cellsentry/issues) for known bugs
- Keep changes focused — one PR per fix/feature
- Update tests if you change behavior

## Submitting Test Cases

The `test-cases/` directory contains synthetic `.xlsx` files that demonstrate detection edge cases. Contributing test cases is one of the best ways to help improve CellSentry's AI model.

### How to contribute

1. Create an `.xlsx` file (Excel, LibreOffice, or script)
2. Add a **comment in cell A1** explaining what the file tests
3. Use a descriptive filename (e.g., `nested-vlookup-cross-sheet.xlsx`)
4. Place it in the correct subdirectory: `test-cases/audit/`, `test-cases/pii/`, or `test-cases/extraction/`
5. Submit a PR

### Privacy guidelines

- **Synthetic data only** — never include real names, phone numbers, emails, IDs, or financial records
- Use clearly fictional data: "Jane Doe", "555-0100", "john@example.com"
- If you can't describe the issue without real data, [file a detection-miss issue](https://github.com/almax000/cellsentry/issues/new?template=detection-miss.yml) instead

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(engine): add new rule for circular references
fix(ui): correct export button alignment
docs: update README with new build instructions
```

## Code Style

- TypeScript with strict mode
- React functional components with hooks
- No `any` types
- Components: PascalCase, functions: camelCase

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
