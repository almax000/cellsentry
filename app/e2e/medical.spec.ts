/**
 * Medical pipeline E2E suite (W5 Step 5.1).
 *
 * Plan v3 mandates seven tests covering the v2 ingest → preview → safety-net
 * flow. We use the W4 textarea-based source input (paste medical text)
 * rather than file drop, because real OCR for image/PDF requires the user
 * to install mlx_vlm + DeepSeek-OCR weights — a 3.93 GB download that
 * doesn't belong in CI. The text-input path exercises the full
 * deterministic pipeline (regex + collision + jieba + date) plus the
 * graceful-degradation safety-net path (when Qwen isn't installed, the
 * bridge reports `unavailable` and the pipeline skips to done).
 *
 * E009 compliance: V2UpgradeBanner (z-index 60) is dismissed in beforeAll
 * so it doesn't intercept clicks on the workspace below.
 */

import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'

let ctx: TestContext
let page: Page

const SAMPLE_MAPPING = `version: 1
next_pseudonym_index: 2
patients:
  - patient_id: family-001
    real_name: 张三
    aliases: [张先生]
    pseudonym: 患者A
    date_mode: preserve
    additional_entities: []
  - patient_id: family-002
    real_name: 李四
    aliases: []
    pseudonym: 患者B
    date_mode: preserve
    additional_entities: []
`

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page

  // Dismiss the V2UpgradeBanner if it's the first launch (it shouldn't be in
  // CI since localStorage starts empty per Electron app data isolation, but
  // we handle both cases). Then wait for the workspace to be interactable.
  const banner = page.locator('[data-testid="v2-banner-dismiss"]')
  if (await banner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await banner.click()
    await page.waitForTimeout(200)
  }
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

/** Helper — fill source textarea + mapping editor, returns when both have content. */
async function loadInput(p: Page, sourceText: string, mappingText: string): Promise<void> {
  // Source textarea
  const source = p.locator('[data-testid="source-textarea"]')
  await source.click()
  await source.fill('')
  await source.fill(sourceText)

  // Mapping editor — CodeMirror 6's editable surface is `.cm-content`. Click to
  // focus, select-all, type the new mapping.
  const mappingEditor = p.locator('.cm-editor .cm-content')
  await mappingEditor.click()
  await p.keyboard.press('Meta+A')
  await p.keyboard.press('Backspace')
  // Use insertText (faster than typing each char) — important for multi-line YAML.
  await p.keyboard.insertText(mappingText)
  await p.waitForTimeout(100)
}

async function clickRun(p: Page): Promise<void> {
  await p.locator('[data-testid="run-pipeline-cta"]').click()
}

// ── Test 1: V2 upgrade banner appears once + dismisses cleanly ──────────

test.describe('V2 first-launch experience', () => {
  test('1. workspace is reachable after banner dismiss', async () => {
    await expect(page.locator('[data-testid="run-pipeline-cta"]')).toBeVisible()
    await expect(page.locator('[data-testid="source-textarea"]')).toBeVisible()
    await expect(page.locator('[data-testid="mapping-editor"]')).toBeVisible()
  })
})

// ── Test 2: Run pipeline → preview viewer renders replacements ──────────

test.describe('Pipeline run + preview', () => {
  test('2. paste text + mapping → run → diff viewer with replacements', async () => {
    await loadInput(
      page,
      '患者 张三 (身份证 11010519491231002X, 联系电话 13812345678) 复诊。',
      SAMPLE_MAPPING,
    )
    await clickRun(page)

    // Wait for preview phase — AuditDiffViewer mounts.
    await expect(page.locator('[data-testid="diff-pane-original"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="diff-pane-redacted"]')).toBeVisible()

    // Redacted pane should contain the pseudonym, NOT the real name.
    const redacted = await page.locator('[data-testid="diff-pane-redacted"]').innerText()
    expect(redacted).toContain('患者A')
    expect(redacted).not.toContain('张三')
    expect(redacted).toContain('[身份证号]')
  })
})

// ── Test 3: Filter chips toggle timeline visibility ─────────────────────

test.describe('Diff viewer filtering', () => {
  test('3. toggling filter chips removes/restores timeline rows', async () => {
    // From Test 2 we're on the preview screen. Toggle the regex filter off.
    const regexFilter = page.locator('[data-testid="timeline-filter-regex"]')
    await expect(regexFilter).toBeVisible()
    const beforeCount = await page.locator('[data-testid^="timeline-row-"]').count()
    await regexFilter.click()
    await page.waitForTimeout(150)
    const afterCount = await page.locator('[data-testid^="timeline-row-"]').count()
    expect(afterCount).toBeLessThan(beforeCount)

    // Re-enable.
    await regexFilter.click()
    await page.waitForTimeout(150)
    const restoredCount = await page.locator('[data-testid^="timeline-row-"]').count()
    expect(restoredCount).toBe(beforeCount)
  })
})

// ── Test 4: Collision warning panel (AD3 must-pass) ─────────────────────

test.describe('Collision pre-scan', () => {
  test('4. mapping has 张三 + input contains 张三丰 → collision panel appears', async () => {
    // Go back to ingest from the diff viewer.
    await page.locator('[data-testid="diff-back"]').click()
    await page.waitForTimeout(300)

    // Mapping has 张三 (患者A); input contains 张三丰. The pre-scan should
    // catch this and surface the CollisionWarningPanel.
    await loadInput(
      page,
      '张三丰创立太极拳, 张三是另一个人。',
      SAMPLE_MAPPING,
    )
    await clickRun(page)

    await expect(page.locator('[data-testid="collision-panel"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="collision-card-0"]')).toBeVisible()
    // The Continue button should be DISABLED (aria-disabled true) while
    // unresolved.
    const continueBtn = page.locator('[data-testid="collision-continue"]')
    await expect(continueBtn).toHaveAttribute('aria-disabled', 'true')
  })
})

// ── Test 5: Resolve all collisions → continue flows back to run gate ────

test.describe('Collision resolution', () => {
  test('5. picking "Approve partial match" enables Continue', async () => {
    // From Test 4 we have 1 collision card. Pick "approve" resolution.
    const approveBtn = page.locator('[data-testid="collision-action-approve-0"]')
    await approveBtn.click()
    await page.waitForTimeout(150)

    const continueBtn = page.locator('[data-testid="collision-continue"]')
    await expect(continueBtn).toHaveAttribute('aria-disabled', 'false')
    await continueBtn.click()
    await page.waitForTimeout(300)
    // Panel dismissed; status banner shows the W4 informational message.
    await expect(page.locator('[data-testid="collision-panel"]')).not.toBeVisible()
  })
})

// ── Test 6: Mapping edits reflect in subsequent runs ────────────────────

test.describe('Mapping persistence within session', () => {
  test('6. edit mapping → re-run → output reflects new pseudonym', async () => {
    // Different mapping with non-default pseudonym.
    const customMapping = `version: 1
next_pseudonym_index: 1
patients:
  - patient_id: family-zhang
    real_name: 张三
    aliases: []
    pseudonym: 老张
    date_mode: preserve
    additional_entities: []
`
    await loadInput(page, '患者 张三 入院。', customMapping)
    await clickRun(page)

    await expect(page.locator('[data-testid="diff-pane-redacted"]')).toBeVisible({ timeout: 5000 })
    const redacted = await page.locator('[data-testid="diff-pane-redacted"]').innerText()
    expect(redacted).toContain('老张')
    expect(redacted).not.toContain('张三')
  })
})

// ── Test 7: Continue → safety-net (graceful degradation in CI / no Qwen) ─

test.describe('Safety-net pass + done state', () => {
  test('7. continue from preview → safety-net path → no-flag final', async () => {
    // From Test 6 we're on the preview. Click Continue → triggers safety-net
    // pass. Without Qwen on disk in CI, the bridge returns unavailable, the
    // result has zero pending_flags, and the workspace transitions to 'done'.
    await page.locator('[data-testid="diff-continue"]').click()
    await page.waitForTimeout(2000) // safety-net runs (mocked / unavailable in CI)

    // Either we land on 'done' (no flags) or 'safety-net' (flags from a real
    // Qwen install). For CI the expected path is 'done'.
    const doneTitle = page.locator('text=/Redaction complete|脱敏完成/i')
    const safetyNetCard = page.locator('[data-testid^="safety-net-card-"]').first()

    await expect(async () => {
      const onDone = await doneTitle.isVisible().catch(() => false)
      const onSafetyNet = await safetyNetCard.isVisible().catch(() => false)
      expect(onDone || onSafetyNet).toBe(true)
    }).toPass({ timeout: 5000 })
  })
})
