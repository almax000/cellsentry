/**
 * Medical pipeline E2E suite (lean rebuild — Day 1 placeholder).
 *
 * Day 6 will write the comprehensive E2E suite for the lean pipeline.
 * Day 1 just keeps the smoke tests viable; complex collision / safety-net
 * suites from W5 are removed because the underlying features are revoked
 * per ADR D21 / AD2 / AD3.
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
    additional_entities: []
  - patient_id: family-002
    real_name: 李四
    aliases: []
    pseudonym: 患者B
    additional_entities: []
`

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page

  const banner = page.locator('[data-testid="v2-banner-dismiss"]')
  if (await banner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await banner.click()
    await page.waitForTimeout(200)
  }
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

async function loadInput(p: Page, sourceText: string, mappingText: string): Promise<void> {
  const source = p.locator('[data-testid="source-textarea"]')
  await source.click()
  await source.fill('')
  await source.fill(sourceText)

  // Mapping editor is now a plain textarea (lean rebuild — CodeMirror removed).
  const mappingEditor = p.locator('.mapping-editor-textarea')
  await mappingEditor.click()
  await p.keyboard.press('Meta+A')
  await p.keyboard.press('Backspace')
  await p.keyboard.insertText(mappingText)
  await p.waitForTimeout(100)
}

async function clickRun(p: Page): Promise<void> {
  await p.locator('[data-testid="run-pipeline-cta"]').click()
}

test.describe('V2 first-launch experience', () => {
  test('1. workspace is reachable after banner dismiss', async () => {
    await expect(page.locator('[data-testid="run-pipeline-cta"]')).toBeVisible()
    await expect(page.locator('[data-testid="source-textarea"]')).toBeVisible()
    await expect(page.locator('[data-testid="mapping-editor"]')).toBeVisible()
  })
})

test.describe('Pipeline run + preview', () => {
  test('2. paste text + mapping → run → diff viewer with replacements', async () => {
    await loadInput(
      page,
      '患者 张三 (身份证 11010519491231002X, 联系电话 13812345678) 复诊。',
      SAMPLE_MAPPING,
    )
    await clickRun(page)

    await expect(page.locator('[data-testid="diff-pane-original"]')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-testid="diff-pane-redacted"]')).toBeVisible()

    const redacted = await page.locator('[data-testid="diff-pane-redacted"]').innerText()
    expect(redacted).toContain('患者A')
    expect(redacted).not.toContain('张三')
    expect(redacted).toContain('[身份证号]')
  })
})

test.describe('Mapping persistence within session', () => {
  test('3. edit mapping → re-run → output reflects new pseudonym', async () => {
    await page.locator('[data-testid="diff-back"]').click()
    await page.waitForTimeout(300)

    const customMapping = `version: 1
next_pseudonym_index: 1
patients:
  - patient_id: family-zhang
    real_name: 张三
    aliases: []
    pseudonym: 老张
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
