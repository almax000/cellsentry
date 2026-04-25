# Screen 2 — Collision Warning Panel (NEW per AD3)

> Pre-flight gate. Catches the `张三 / 张三丰` problem before redaction
> corrupts a legitimate longer name. Pipeline is BLOCKED until the user
> resolves every flagged overlap.

## Why this screen exists

User's mapping says `张三 → 患者A`. Input contains `张三丰在武当山创立太极拳`.
Naive jieba whole-token replace would either:
- Replace `张三` inside `张三丰`, producing `患者A丰` (corruption)
- Or correctly leave `张三丰` alone — but the user might NOT have wanted
  `张三丰`'s real name in the output either

Per D19, the user is the authority on who gets pseudonymized. CellSentry's
job is to surface every potential collision and require an explicit decision.
No silent guessing.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⚠ Pipeline blocked — 3 name overlaps found                              │
│  Resolve each one before redaction can run.                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Overlap 1 of 3                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Mapping: 张三 → 患者A                                              │ │
│  │  Found in input:  …张三丰在武当山创立…                              │ │
│  │                                                                    │ │
│  │  The longer name 张三丰 contains your mapping key 张三 but is not   │ │
│  │  itself in the mapping. Pseudonymizing 张三 here would corrupt     │ │
│  │  the legitimate longer name.                                       │ │
│  │                                                                    │ │
│  │  [ Add 张三丰 to mapping with new pseudonym ]                       │ │
│  │  [ Approve partial match (treat 张三 here as 患者A) ]                │ │
│  │  [ Skip — leave both names as-is ]                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Overlap 2 of 3                                                          │
│  …                                                                       │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────   │
│                                                                          │
│  [ Cancel pipeline ]                                  [ Continue ▶ ]    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Modal-like full-pane takeover (replaces the workspace pane content; sidebar
remains active). Cannot be dismissed except by either resolving all overlaps
+ clicking Continue, or clicking Cancel.

## Components

| Component | New? | Notes |
|-----------|------|-------|
| `<CollisionWarningPanel>` | new | container; manages list state + Continue gating |
| `<CollisionCard>` | new | one per overlap |
| `<ContextSnippet>` | new | shows ~30 chars of context with the overlap highlighted |
| `<CollisionResolution>` | new | three-button group per card |
| `<NewMappingInline>` | new | inline form for "Add longer name to mapping" — opens inside the card; submit calls `medical:scan-collisions` again to re-check |

## State machine (per card)

```
[unresolved]
  ↓ user picks one of:
[adding-to-mapping]   → inline form to enter pseudonym for the longer name
                       ↓ submit
                    [resolved-add]
[approved-partial]                  → records explicit approval; partial replace will run
[skipped]                           → both names stay as-is in output
```

`Continue` button is enabled iff every card is in a `resolved-*` state.

## Resolution semantics (downstream effect)

| Choice | Mapping change | Pipeline behavior |
|--------|----------------|-------------------|
| Add longer to mapping | new patient entry appended to YAML | both names get distinct pseudonyms; consistent across docs |
| Approve partial | no mapping change | jieba replaces `张三` even inside `张三丰` (with explicit user approval logged in audit) |
| Skip | no mapping change | both names left untouched in output |

The "Approve partial" choice is loaded — it's a user-explicit override of the
correctness check, not a default. UI emphasis: the button is **secondary**
styled (border-only, not filled); the recommended choice (Add to mapping) is
**primary** styled.

## Keyboard

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Navigate between cards and resolution buttons |
| `Enter` | Activate focused button |
| `1` / `2` / `3` | Quick-select resolution for the focused card |
| `Esc` | Cancel pipeline (with confirm) |
| `Cmd+Enter` | Continue (only if all resolved) |

## Accessibility

- Container: `role="dialog" aria-labelledby="collision-title" aria-describedby="collision-summary"`
- `<h2 id="collision-title">Pipeline blocked — name overlaps detected</h2>`
- Each card: `role="group" aria-labelledby="overlap-{i}-title"`
- ContextSnippet: the matched substring inside it is `<mark>张三</mark>` so screen readers announce it as highlighted
- "Continue" button announces remaining unresolved count: `aria-label="Continue (3 unresolved)"`

## Copy

| Key | EN | ZH-CN |
|-----|----|-------|
| panel.title | Pipeline blocked — name overlaps detected | 流水线阻塞 —— 检测到名称重叠 |
| panel.subtitle | {n} overlaps found. Resolve each before continuing. | 找到 {n} 处重叠。逐个解决后才能继续。 |
| card.heading | Mapping {shorter} → {pseudonym} | 映射 {shorter} → {pseudonym} |
| card.found | Found in input: {context} | 输入中发现: {context} |
| card.explain | The longer name {longer} contains your mapping key {shorter} but is not itself in the mapping. Pseudonymizing {shorter} here would corrupt the legitimate longer name. | 较长名 {longer} 包含映射 key {shorter}，但本身不在映射里。在这里假名化 {shorter} 会污染合法长名。 |
| action.add | Add {longer} to mapping with new pseudonym | 把 {longer} 加进映射，分配新假名 |
| action.approve | Approve partial match (treat {shorter} here as {pseudonym}) | 批准部分匹配（这里 {shorter} 当 {pseudonym}） |
| action.skip | Skip — leave both names as-is | 跳过 —— 两个名字都保留原样 |
| inline.pseudonymPlaceholder | Pseudonym for {longer} (e.g. 武术家A) | {longer} 的假名（如 武术家A） |
| inline.submit | Add to mapping | 加进映射 |
| inline.cancel | Cancel | 取消 |
| footer.cancel | Cancel pipeline | 取消流水线 |
| footer.continue | Continue ({unresolved} unresolved) | 继续（{unresolved} 未解决） |
| footer.continueReady | Continue ▶ | 继续 ▶ |

## Test hooks

- `data-testid="collision-panel"` on container
- `data-testid="collision-card-{index}"` on each card
- `data-testid="collision-action-add-{index}"`, `-approve-{index}`, `-skip-{index}`
- `data-testid="collision-continue"` on footer continue
- `data-testid="collision-cancel"` on footer cancel

## Failure modes

| Failure | UI behavior |
|---------|-------------|
| User picks "Add longer" but pseudonym is empty / matches existing | inline lint: "Pseudonym must be unique and non-empty" |
| User picks "Add longer" and the new pseudonym ITSELF causes new overlaps | re-run collision scan; new cards appear; user resolves recursively |
| Pipeline cancelled mid-resolution | preserve resolved-cards in state; user can resume by re-clicking Run pipeline |

## Critical correctness test (must-pass for W3 Step 3.6 sign-off)

```
Given mapping: { 张三 → 患者A }
And input: 张三丰在武当山创立太极拳
When user clicks Run pipeline
Then collision panel shows 1 card
And the card heading says "张三 → 患者A"
And the card contextSnippet contains <mark>张三</mark>丰
And Continue button is disabled with aria-label "Continue (1 unresolved)"
```
