# Screen 3 — Redaction Preview / Audit Diff Viewer

> After regex + mapping + date pass, before the safety-net commit. Shows
> the user a side-by-side diff of original → redacted with hover-tooltips
> explaining each replacement.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Redaction preview — lab_2024.pdf  •  3 patients  •  47 replacements    │
├─────────────────────────────────────┬────────────────────────────────────┤
│  Original                           │  Redacted                          │
│  ┌─────────────────────────────┐    │  ┌─────────────────────────────┐  │
│  │ 患者 张三 (男, 1980-05-12)    │    │  │ 患者 [患者A] (男, 1980-05-12) │  │
│  │ 病历号: 12345678901           │    │  │ 病历号: [病历号]              │  │
│  │ 联系人: 13812345678          │    │  │ 联系人: [手机号]              │  │
│  │ 主诉: 头痛三周, 张三表示…    │    │  │ 主诉: 头痛三周, [患者A]表示…  │  │
│  └─────────────────────────────┘    │  └─────────────────────────────┘  │
│                                     │                                    │
├─────────────────────────────────────┴────────────────────────────────────┤
│  Replacements timeline                                                   │
│  ▢ mapping (12)   ▢ regex.id (3)   ▢ regex.mobile (5)   ▢ date (0)      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  • 张三 → [患者A]  (mapping)         line 1, 4 occurrences               │
│  • 12345678901 → [病历号]  (regex)   line 2                              │
│  • 13812345678 → [手机号]  (regex)   line 3                              │
│  …                                                                       │
└──────────────────────────────────────────────────────────────────────────┘
│                                                                          │
│  [ ◁ Back to mapping ]              [ Continue to safety-net review ▶ ] │
└──────────────────────────────────────────────────────────────────────────┘
```

Three-row layout:
1. **Top bar:** filename + summary stats
2. **Diff body:** two-column scroll-synced original / redacted
3. **Replacements timeline:** filterable list of every replacement with reason

## Components

| Component | New? | Notes |
|-----------|------|-------|
| `<RedactionPreview>` | new | container, owns scroll-sync state |
| `<DiffPane>` | new | one per side; uses CSS Grid with line numbers |
| `<DiffSegment>` | new | renders a chunk: either plain text or a replacement with hover-tooltip |
| `<ReplacementTimeline>` | new | scrollable list, virtualized if > 200 items |
| `<ReplacementFilter>` | new | checkbox group filtering by `reason` (mapping / regex / safety_net / date) |

## Diff rendering rules

- Replacements rendered as `<span class="repl repl-{reason}">{pseudonym}</span>`.
- Hover tooltip shows: `original → pseudonym`, reason, span (line:col), pattern_type if regex.
- Click a replacement: scrolls timeline list to corresponding entry + highlights.
- Click a timeline entry: scrolls both panes to the replacement + highlights.

Color coding (uses brand palette):
- `mapping` — green (#2B7D3E, brand color)
- `regex` — blue (#1E90FF)
- `safety_net` — amber (#F59E0B) — won't appear here yet (this screen is pre-safety-net)
- `date` — purple (#8B5CF6)

## Scroll sync

Both panes scroll together. Implementation: shared `scrollTop` controlled
ref. When user scrolls one pane, set the other's `scrollTop` to match
proportionally (since redacted may be shorter or longer than original).

Alternative if proportional sync feels weird: line-anchor sync (line N in
original ↔ line N in redacted). Pick whichever feels less janky in the
visual mockup.

## Keyboard

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous replacement (vim-style) |
| `Cmd+F` | Focus search-in-original (filter replacements by text match) |
| `1` / `2` / `3` / `4` | Toggle filter (mapping / regex / safety / date) |
| `Cmd+Enter` | Continue to safety-net review |
| `Esc` / `Cmd+[` | Back to mapping |

## Accessibility

- Diff panes are NOT scrollable for screen readers (use the timeline instead — sequential).
- Each replacement: `<button aria-label="Replacement: 张三 to 患者A, reason mapping, line 1">`.
- Timeline filter: `<fieldset role="group" aria-label="Filter replacements by reason">`.
- Stats bar: `aria-live="polite"` so toggling filters announces "Showing 12 of 47 replacements."

## Copy

| Key | EN | ZH-CN |
|-----|----|-------|
| header.title | Redaction preview — {filename} | 脱敏预览 —— {filename} |
| header.summary | {patients} patients · {count} replacements | {patients} 个患者 · {count} 处替换 |
| pane.original | Original | 原文 |
| pane.redacted | Redacted | 脱敏后 |
| filter.mapping | Mapping ({n}) | 映射 ({n}) |
| filter.regex | Regex ({n}) | 正则 ({n}) |
| filter.safety | Safety-net ({n}) | 安全网 ({n}) |
| filter.date | Date ({n}) | 日期 ({n}) |
| timeline.empty | No replacements match the current filter. | 当前筛选下没有替换。 |
| tooltip.reason.mapping | from your mapping | 来自你的映射 |
| tooltip.reason.regex | matched {pattern_type} regex with checksum | {pattern_type} 正则 + 校验和命中 |
| tooltip.reason.date | {date_mode} transformation | {date_mode} 日期处理 |
| footer.back | ◁ Back to mapping | ◁ 返回映射 |
| footer.continue | Continue to safety-net review ▶ | 继续到安全网复查 ▶ |

## Test hooks

- `data-testid="redaction-preview"` on container
- `data-testid="diff-pane-original"` / `diff-pane-redacted"`
- `data-testid="replacement-{index}"` on each diff segment
- `data-testid="replacement-tooltip-{index}"` on each tooltip
- `data-testid="timeline-filter-{reason}"` on each filter checkbox
- `data-testid="timeline-row-{index}"` on each timeline list item

## Failure modes

| Failure | UI behavior |
|---------|-------------|
| Original is huge (> 100k chars) | virtualize both panes via `react-window`; timeline always virtualized for > 200 entries |
| OCR result is unstructured (no clear paragraph breaks) | render as preformatted block; replacements still clickable |
| `safety_net` reason appears here (shouldn't pre-safety-net) | render as `safety_net` color anyway; in W4 polish iteration we may merge screens 3+4 |
