# Screen 1 — Ingest + Mapping Workspace

> Entry point. User drops a record, edits the mapping that controls
> pseudonymization, and kicks off the pipeline.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Sidebar (existing v1 chrome)                                             │
│  • CellSentry brand                                                       │
│  • [Workspace] [History] [Settings] vertical nav                          │
├──────────────────────────────────────────────────────────────────────────┤
│  Top bar — Workspace label + archive-dir indicator                       │
│   [📁 ~/Documents/health-vault]   [pseudonym-map.md ▾]  [▶ Run pipeline] │
├─────────────────────────────────────┬────────────────────────────────────┤
│                                     │                                    │
│   DropZone                          │  MappingEditor (CodeMirror 6)      │
│   ┌─────────────────────────────┐   │  ┌──────────────────────────────┐  │
│   │                             │   │  │ ---                          │  │
│   │   Drop image / PDF / .txt   │   │  │ version: 1                   │  │
│   │                             │   │  │ next_pseudonym_index: 3      │  │
│   │      OR click to browse     │   │  │ ---                          │  │
│   │                             │   │  │                              │  │
│   └─────────────────────────────┘   │  │ - patient_id: family-001     │  │
│                                     │  │   real_name: 张三            │  │
│   Queue (after first drop)          │  │   aliases: [张先生, Zhang]   │  │
│   ┌─────────────────────────────┐   │  │   pseudonym: 患者A           │  │
│   │ 🟢 lab_2024.pdf  ✓ ready    │   │  │   date_mode: preserve        │  │
│   │ 🟡 prescription.jpg  …      │   │  │                              │  │
│   │ ⚪ visit-notes.txt          │   │  │ - patient_id: family-002     │  │
│   └─────────────────────────────┘   │  │   ...                        │  │
│                                     │  └──────────────────────────────┘  │
│                                     │   Cmd+S to save  •  Lint: 0 issues │
│                                     │                                    │
│                                     │  Date mode  ⊙ Preserve            │
│                                     │             ◯ Offset  [N] days    │
│                                     │             ◯ Bucket to month     │
│                                     │                                    │
└─────────────────────────────────────┴────────────────────────────────────┘
```

Two-pane horizontal layout, 50/50 split, resizable divider with persist
across sessions (localStorage key `medical.ingest.split`).

## Components

| Component | Source | Notes |
|-----------|--------|-------|
| `<DropZone>` | reuse from v1 | accept: `.pdf .jpg .jpeg .png .heic .webp .txt` |
| `<IngestQueue>` | new | list of dropped files w/ status pill + remove button |
| `<MappingEditor>` | new | CodeMirror 6 + YAML mode + lint extension. **Not Monaco** — Warning #8 |
| `<DateModeSelector>` | new | radio group, persists per-patient in YAML |
| `<ArchiveDirIndicator>` | new | shows current `{archive_dir}`; click → reveal in Finder |
| `<RunPipelineButton>` | new | primary CTA top-right; disabled until queue has at least 1 ready file AND mapping is non-empty |

## State machine

```
[empty]
  ↓ user drops first file
[file dropped, mapping empty]
  ↓ user types in mapping editor
[mapping non-empty]
  ↓ user clicks Run pipeline
[pre-flight: collision scan running]
  ↓ collisions found?
   → screen 2 (Collision Warning Panel)
  ↓ no collisions
[pipeline running]
  ↓ stage transitions: ingest → regex → mapping → date → safety-net
[safety-net complete, flags > 0]
  ↓ → screen 4 (Safety-net Review)
[safety-net complete, flags = 0]
  ↓ → screen 3 (Redaction Preview), auto-confirmed
```

## Keyboard

| Key | Action | Notes |
|-----|--------|-------|
| `Cmd+O` | Open file dialog | reuses existing `dialog:open-files` IPC |
| `Cmd+S` | Save mapping | triggers writer.ts; dirty indicator clears |
| `Cmd+R` | Run pipeline | gated on collision-clear; equivalent to clicking the button |
| `Cmd+/` | Toggle YAML comment | CodeMirror built-in |
| `Cmd+\` | Resize divider 50/50 | for E2E test reset |
| `Esc` | Cancel running pipeline | confirms first |

## Accessibility

- DropZone: `<div role="button" aria-label="Drop files or click to browse" tabindex="0">`. Enter / Space activates same as click.
- MappingEditor: CodeMirror 6 has built-in screen-reader support; verify with VoiceOver smoke.
- DateMode radios: `<fieldset role="radiogroup" aria-labelledby="date-mode-legend">`.
- Run pipeline button: `aria-disabled` reflects state; `aria-describedby` points to inline reason ("Mapping required" / "Drop a file first").
- Live region for pipeline status: `<div aria-live="polite" aria-atomic="false">`. Announces: "Pre-flight collision scan starting", "Collisions found, please review", "Pipeline running", "Pipeline complete."

## Copy

| Key | EN | ZH-CN |
|-----|----|-------|
| dropzone.title | Drop image / PDF / .txt here | 把图片 / PDF / .txt 拖进来 |
| dropzone.subtitle | or click to browse | 或点击选择文件 |
| dropzone.formats | Accepted: .pdf .jpg .png .heic .webp .txt | 支持: .pdf .jpg .png .heic .webp .txt |
| mapping.placeholder | (empty mapping — add patient entries below) | （映射为空 —— 在下面添加患者条目） |
| mapping.savedToast | Saved to {archive_dir}/pseudonym-map.md | 已保存到 {archive_dir}/pseudonym-map.md |
| dateMode.preserve | Preserve absolute dates (default) | 保留绝对日期（默认） |
| dateMode.offsetDays | Offset all dates by N days | 整体偏移 N 天 |
| dateMode.bucketMonth | Round dates to first of month | 按月对齐到月初 |
| run.cta | Run pipeline | 运行流水线 |
| run.disabledNoFile | Drop a file first | 先拖入档案 |
| run.disabledNoMapping | Add at least one patient to the mapping | 至少在映射里加一个患者 |
| run.runningStage | Running: {stage} | 运行中: {stage} |

## IPC

| Channel | Direction | Payload |
|---------|-----------|---------|
| `medical:ingest` | renderer → main | `{kind, path}` or `{kind: 'text', content}` |
| `medical:scan-collisions` | renderer → main | `(mappingPath, chunks)` — pre-flight |
| `medical:redact` | renderer → main | full pipeline |
| `medical:preview` | renderer → main | dry-run (skip writes) |
| `medical:audit-event` | main → renderer | streaming events for live region |

## Test hooks (E2E)

- `data-testid="ingest-dropzone"` on the drop area
- `data-testid="ingest-queue"` on the queue list
- `data-testid="ingest-queue-item-{filename}"` on each queue entry
- `data-testid="mapping-editor"` on the CodeMirror container (`.cm-editor`)
- `data-testid="date-mode-selector"` on the radio group
- `data-testid="run-pipeline-cta"` on the Run button

## Failure modes

| Failure | UI behavior |
|---------|-------------|
| Mapping YAML invalid | inline lint error in CodeMirror, line + column highlighted; Run button disabled with `aria-describedby` pointing to lint message |
| Mapping save fails (permission) | toast: "Could not write to {path} — check folder permissions" |
| `{archive_dir}` missing or readonly | top banner; Run blocked; CTA "Open settings to choose a different folder" |
| Python bridge dead (status: available=false) | banner: "Local AI unavailable — pipeline will skip safety-net review. Continue?" → user picks yes/no |
| No-DSO model on disk on first run | full-screen download gate (existing v1 model gate UI, repurposed) |
