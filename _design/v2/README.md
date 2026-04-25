# v2 UI Design Specs (W2 Step 2.2)

> Spec docs for the 4 v2 medical-pseudonymization UI screens. These are the
> contract that W3 Step 3.6 implementation builds against. Visual mockups
> via `/frontend-design` skill are deferred to W3 — these specs are
> structural / textual / behavioral and are skill-input-quality on their own.

## Why no `/frontend-design` invocation in W2

The frontend-design skill produces visual + code-level designs in one shot.
Invoking it cold against a 4-screen brief yields scattered output with low
component-reuse coherence. Better workflow:

1. **W2 (this step):** lock structure, state, copy, a11y, keyboard. Written
   specs below.
2. **W3 Step 3.2-3.5:** backend (mapping engine + collision scan + jieba)
   exists; we know the real shape of CollisionWarning / Replacement /
   SafetyNetFlag at runtime.
3. **Just before W3 Step 3.6:** invoke `/frontend-design` with these specs
   as input. The skill works better as a refinement layer over an already-
   solid spec than as a cold-start designer.

## The 4 screens

| # | Screen | Spec file | Position in pipeline |
|---|--------|-----------|----------------------|
| 1 | Ingest + Mapping workspace | `screen-1-ingest-mapping.md` | Drop a file, edit mapping, kick off pipeline |
| 2 | Collision warning panel | `screen-2-collision-warning.md` | Pre-flight gate (AD3): blocks pipeline until user resolves overlapping names |
| 3 | Redaction preview / audit diff | `screen-3-redaction-preview.md` | After regex+mapping but before safety-net commit |
| 4 | Safety-net review | `screen-4-safety-net-review.md` | After Qwen2.5-3B flags missed names, before final export |

## Design tokens

Inherits from existing `app/src/styles/` (v1 chrome) — same dark sidebar, light
content area, Plus Jakarta Sans, deep-green brand color `#2B7D3E` (per D23 brand
preservation). No new color system. New typography hierarchy needed for the
mapping editor (monospace YAML); use the existing `mono` font stack.

## Cross-cutting requirements (apply to all 4 screens)

- **Keyboard-first**: every action reachable without mouse. No floating
  modals that trap focus without a `data-testid` opt-out for E2E.
- **Live region announcements** (aria-live="polite") for pipeline stage
  transitions, collision detection, safety-net flag emission.
- **Bilingual EN + ZH-CN**: copy variants captured in each spec. Use existing
  `react-i18next` with new `medical` namespace.
- **Privacy-by-default**: never write PII to console.log, electron logs, or
  any persisted store outside `{archive_dir}/audit.log.jsonl`. Audit log
  uses sha256[:16] hashes per security-assessment P2#8.
- **Graceful degradation**: each screen renders a useful state when the
  Python LLM bridge reports `available: false`. The Mapping screen still
  works; only safety-net review falls back to "Manual review only — local
  LLM unavailable. You can still finalize the redaction."
