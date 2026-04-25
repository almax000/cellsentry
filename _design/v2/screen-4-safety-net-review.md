# Screen 4 — Safety-Net Review

> After Qwen2.5-3B has reviewed the redacted output and flagged any names
> that look like real people but weren't in the user's mapping. User
> resolves each flag (add to mapping / replace manually / dismiss). After
> all flags resolved, the export button unlocks.

## Why this screen

Per D19 + AD2: user mapping is the contract; LLM safety-net is the LAST
line of defense. The model will sometimes flag false positives (Chinese
medical terms that look like surnames; English drug names that look like
people). User must explicitly classify each flag — the tool doesn't auto-
fix LLM output because that compounds error.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Safety-net review — 3 names flagged                                     │
│  Local Qwen2.5-3B reviewed the redacted output. Decide each flag below. │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ⚠ Flag 1 of 3                                  Confidence: ●●●●○ 0.85  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Suspicious name: 王医生                                            │ │
│  │  Context: …由 王医生 主治, 处方……                                    │ │
│  │  Suggested replacement: 医师A                                       │ │
│  │                                                                    │ │
│  │  ◯ Add to mapping with pseudonym  [医师A___________] [ Apply ]     │ │
│  │  ◯ Replace manually in this output only  [_________] [ Apply ]     │ │
│  │  ◯ Dismiss — false positive                                         │ │
│  │  ◯ Decide later — leave as-is in output                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Flag 2 of 3                                  Confidence: ●●○○○ 0.40    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Suspicious name: 张氏                                              │ │
│  │  …                                                                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Flag 3 of 3 — already dismissed ✓                                      │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  [ ◁ Back to preview ]   [ Skip safety-net ]    [ Export redacted ▶ ]   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Components

| Component | New? | Notes |
|-----------|------|-------|
| `<SafetyNetReview>` | new | container, manages flag state |
| `<SafetyNetCard>` | new | one per flag |
| `<ConfidenceMeter>` | new | 5-dot meter (0.0-0.2 = 0 dots; 0.8-1.0 = 5) |
| `<FlagResolution>` | new | radio group with inline form for "Add to mapping" / "Replace manually" |
| `<SafetyNetSkippedBanner>` | new | shown if Python bridge unavailable; CTA "Continue without safety-net" |

## State machine (per flag)

```
[unresolved]
  ↓
[add-to-mapping]    submit pseudonym → record in YAML; mapping editor would show new entry next session
[replace-once]      manual replacement, this run only; doesn't go to mapping
[dismissed]         no replacement, marked false positive; logged in audit
[deferred]          left as-is in this run; flagged in audit log so user sees it later
```

`Export` button is enabled when every flag is in a terminal state (any of the four).

## Confidence meter UX

The meter is informational, NOT load-bearing — user decides regardless of
confidence. Use it to prioritize attention: high-confidence flags first,
low-confidence flags expanded only on click.

```
0.0–0.2:  ○○○○○   (very unlikely; expand on click)
0.2–0.4:  ●○○○○
0.4–0.6:  ●●○○○
0.6–0.8:  ●●●●○   (default expanded)
0.8–1.0:  ●●●●●   (default expanded; bright color)
```

## Keyboard

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous flag |
| `1` | Add to mapping (focus pseudonym input) |
| `2` | Replace manually (focus replacement input) |
| `3` | Dismiss as false positive |
| `4` | Defer |
| `Cmd+Enter` | Export (only when all flags resolved) |
| `Esc` | Back to preview |

## Accessibility

- Container: `role="region" aria-labelledby="safety-net-title"`.
- Each card: `role="group" aria-labelledby="flag-{i}-title"`.
- Confidence meter: `aria-label="Model confidence: 0.85 of 1.0"`.
- Inline forms: `<label for="flag-{i}-pseudonym">Pseudonym for {name}</label>`.
- Live region announces resolution count: "2 of 3 flags resolved."

## Failure modes — graceful degradation

The safety-net pass can fail in several ways. UI must handle each:

| Failure | Behavior |
|---------|----------|
| Python bridge unavailable (status: available=false) | banner above flags: "Local AI unavailable — safety-net skipped. You can manually scan the preview for missed names below." Show the redacted preview inline; user proceeds with `Skip safety-net`. |
| LLM returned malformed JSON (parser returned null) | banner: "Local AI returned an unreadable response. Treat the preview as final, or retry." `[ Retry safety-net ]` button. |
| LLM returned `[]` (no flags) | skip this screen entirely; auto-route to export. |
| LLM ran but the redacted output was empty | should never happen; if it does, surface error. |

## Copy

| Key | EN | ZH-CN |
|-----|----|-------|
| header.title | Safety-net review — {n} names flagged | 安全网复查 —— flag 了 {n} 个名字 |
| header.subtitle | Local Qwen2.5-3B reviewed the redacted output. Decide each flag below. | 本地 Qwen2.5-3B 复查了脱敏后输出。下面逐条决定。 |
| card.heading | Suspicious name: {name} | 可疑名: {name} |
| card.context | Context: {context} | 上下文: {context} |
| card.suggested | Suggested replacement: {suggested} | 建议替换: {suggested} |
| action.add | Add to mapping with pseudonym | 加进映射，给个假名 |
| action.replaceOnce | Replace manually in this output only | 仅在此输出中手动替换 |
| action.dismiss | Dismiss — false positive | 忽略 —— 误报 |
| action.defer | Decide later — leave as-is in output | 延后决定 —— 保留原样 |
| placeholder.pseudonym | e.g. 医师A | 如 医师A |
| placeholder.replacement | e.g. [医生] | 如 [医生] |
| btn.apply | Apply | 应用 |
| confidence.label | Confidence: {value} | 置信度: {value} |
| degraded.aiUnavailable | Local AI unavailable — safety-net skipped. Manually scan the preview below for missed names. | 本地 AI 不可用 —— 安全网已跳过。请人工扫描下方预览检查漏掉的人名。 |
| degraded.aiBadResponse | Local AI returned an unreadable response. Retry, or treat the preview as final. | 本地 AI 返回了无法解析的响应。重试，或把预览当最终版。 |
| btn.retrySafetyNet | Retry safety-net | 重试安全网 |
| btn.skipSafetyNet | Skip safety-net | 跳过安全网 |
| btn.export | Export redacted ▶ | 导出脱敏文件 ▶ |

## Test hooks

- `data-testid="safety-net-review"` on container
- `data-testid="safety-net-card-{index}"` on each card
- `data-testid="safety-net-action-{kind}-{index}"` for each radio
- `data-testid="safety-net-confidence-{index}"` on the meter
- `data-testid="safety-net-export"` on export button
- `data-testid="safety-net-degraded-banner"` when bridge unavailable

## Audit log entries emitted

| User action | AuditAction | Details |
|-------------|-------------|---------|
| Add to mapping | `safety_net_resolved` | `{flag_name_hash, resolution: 'add_to_mapping', pseudonym}` |
| Replace once | `safety_net_resolved` | `{flag_name_hash, resolution: 'replace_once'}` |
| Dismiss | `safety_net_resolved` | `{flag_name_hash, resolution: 'dismissed'}` |
| Defer | `safety_net_resolved` | `{flag_name_hash, resolution: 'deferred'}` |
| Export | `export` | `{output_path_hash, replacement_count, deferred_count}` |

`flag_name_hash` is sha256(name)[:16] — never raw PII (P2#8).

## Critical correctness test (must-pass for W3 sign-off)

```
Given the safety-net returns:
  [{"name": "王医生", "context": "由 王医生 主治", "confidence": 0.85}]
When the screen renders
Then 1 card appears with name "王医生"
And the card shows confidence 4 dots filled, 1 empty
And Export button is disabled with aria-label "Export (1 unresolved)"

When the user clicks "Dismiss" on the card
Then the card collapses to "Dismissed ✓"
And Export button becomes enabled
And an audit log entry of type safety_net_resolved is queued
```
