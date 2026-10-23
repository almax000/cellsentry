import { test, expect, type Page } from '@playwright/test'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import { OCR_ENABLED } from '../shared/redact/features'

// Every person, number and address below is made up for this test.
const REPORT = [
  '2025 年度健康体检报告',
  '姓名：张伟  性别：男  年龄：45 岁',
  '身份证号：11010519491231002X',
  '体检编号：TJ20250001  联系电话：139 1234 5678',
  '家属：王丽华  主检医生：李建国',
  '住址：杭州市西湖区文三路100号',
  '检查机构：上海市第一人民医院',
  '总胆固醇 6.2 mmol/L ↑ < 5.2',
].join('\n')

let ctx: TestContext
let page: Page

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

async function useChinese(): Promise<void> {
  await page.locator('[data-testid="sidebar-nav-settings"]').click()
  await page.locator('[data-testid="settings-lang-select"]').selectOption('zh')
}

async function openRedaction(): Promise<void> {
  await page.locator('[data-testid="sidebar-nav-pii"]').click()
  await expect(page.locator('[data-testid="entry-pii"]')).toBeVisible()
}

/**
 * Selects the whole page, like Cmd+A, then copies or drags from the steps bar, outside the shareable text.
 * Returns whether the page blocked it and the plain text it let out.
 */
async function selectAllAnd(action: 'copy' | 'drag'): Promise<{ blocked: boolean; text: string }> {
  return page.evaluate((kind) => {
    const selection = window.getSelection()!
    selection.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(document.body)
    selection.addRange(range)
    const target = document.querySelector('[data-testid="redact-steps"]')!
    const data = new DataTransfer()
    let blocked: boolean
    if (kind === 'copy') {
      const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data })
      target.dispatchEvent(event)
      // Blocked means nothing was written; a guarded copy writes only the shareable part.
      blocked = event.defaultPrevented && data.getData('text/plain') === ''
    } else {
      const start = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data })
      target.dispatchEvent(start)
      blocked = start.defaultPrevented
    }
    selection.removeAllRanges()
    return { blocked, text: data.getData('text/plain') }
  }, action)
}

async function pasteAndStart(text: string): Promise<void> {
  await page.locator('[data-testid="redact-paste-toggle"]').click()
  await page.locator('[data-testid="redact-paste-input"]').fill(text)
  await page.locator('[data-testid="redact-paste-start"]').click()
  await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()
}

test.describe('Document redaction', () => {
  test('My info is saved locally and shows the fixed codes', async () => {
    await useChinese()
    await openRedaction()
    await page.locator('[data-testid="myinfo-edit-self"]').click()
    const self = page.locator('[data-testid="myinfo-editor-self"]')
    await self.locator('[data-testid="myinfo-input-name"]').fill('张伟')
    await self.locator('[data-testid="myinfo-input-phone"]').fill('13912345678')
    await self.locator('[data-testid="myinfo-save"]').click()
    await expect(page.locator('[data-testid="myinfo-person-self"]')).toContainText('患者A')
    await expect(page.locator('[data-testid="myinfo-person-self"]')).toContainText('139 **** 5678')

    await page.locator('[data-testid="myinfo-add-family"]').click()
    const family = page.locator('[data-testid="myinfo-editor-family"]')
    await family.locator('[data-testid="myinfo-input-relation"]').fill('妈妈')
    await family.locator('[data-testid="myinfo-input-name"]').fill('王丽华')
    await family.locator('[data-testid="myinfo-save"]').click()
    await expect(page.locator('[data-testid="myinfo-person-family"]')).toContainText('家人B')
  })

  test('pasted text is reviewed, shared without originals, and restored', async () => {
    await pasteAndStart(REPORT)
    await expect(page.locator('[data-testid="redact-review-title"]')).toContainText('处个人信息')

    // Staff names remain reviewable and now start with replacement selected (ADR-0018).
    const doctor = page.locator('[data-testid="redact-unsure"]').filter({ hasText: '李建国' })
    await expect(doctor.locator('[data-testid="redact-choice-replace"]')).toHaveAttribute('aria-pressed', 'true')
    await doctor.locator('[data-testid="redact-choice-keep"]').click()
    await expect(page.locator('[data-testid="redact-preview-text"]')).toContainText('李建国')
    await doctor.locator('[data-testid="redact-choice-replace"]').click()

    const preview = page.locator('[data-testid="redact-preview-text"]')
    await expect(preview).toContainText('患者A')
    await expect(preview).not.toContainText('张伟')
    await page.locator('[data-testid="redact-view-original"]').click()
    await expect(preview).toContainText('张伟')
    await page.locator('[data-testid="redact-view-replaced"]').click()

    await page.locator('[data-testid="redact-review-next"]').click()
    await expect(page.locator('[data-testid="redact-share"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-residue"]')).toHaveAttribute('data-count', '0')
    const shared = page.locator('[data-testid="redact-share-text"]')
    for (const code of ['患者A', '家人B', '电话1', '证件1', '编号1', '地址1', '医生1']) await expect(shared).toContainText(code)
    for (const original of ['张伟', '王丽华', '李建国', '139 1234 5678', '11010519491231002X', 'TJ20250001', '文三路']) {
      await expect(shared).not.toContainText(original)
    }
    // Medical context stays for the AI.
    await expect(shared).toContainText('上海市第一人民医院')
    await expect(shared).toContainText('总胆固醇 6.2 mmol/L')

    await page.locator('[data-testid="redact-copy"]').click()
    const copied = await ctx.app.evaluate(() => (globalThis as { __cellsentryTestClipboard?: string }).__cellsentryTestClipboard)
    expect(copied).toContain('患者A')
    expect(copied).not.toContain('张伟')

    await page.locator('[data-testid="redact-share-next"]').click()
    await page.locator('[data-testid="redact-answer"]').fill('患者A 的总胆固醇偏高，建议三个月后复查。家人B 也可以一起查。患者C 的数据没有出现。患者A型血。')
    const restored = page.locator('[data-testid="redact-restored-text"]')
    await expect(restored).toContainText('张伟 的总胆固醇偏高')
    await expect(restored).toContainText('王丽华 也可以一起查')
    await expect(page.locator('[data-testid="redact-unknown-codes"]')).toContainText('患者C')
    // 患者A型血 reads like a blood type: left as written and marked, not swapped silently.
    await expect(page.locator('[data-testid="redact-ambiguous"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-seg-ambiguous"]')).toHaveText('患者A')
    // Any restored spot can be switched back to its code, and the copy follows.
    const firstRestored = page.locator('[data-testid="redact-seg-restored"]').first()
    await firstRestored.click()
    await expect(firstRestored).toHaveAttribute('data-on', 'false')
    await expect(firstRestored).toHaveText('患者A')
    await page.locator('[data-testid="redact-restored-copy"]').click()
    const restoredCopy = await ctx.app.evaluate(() => (globalThis as { __cellsentryTestClipboard?: string }).__cellsentryTestClipboard)
    expect(restoredCopy).toContain('患者A 的总胆固醇偏高')
    expect(restoredCopy).toContain('王丽华 也可以一起查')

    await page.locator('[data-testid="redact-start-over"]').click()
    await page.locator('[data-testid="redact-start-over-yes"]').click()
    await expect(page.locator('[data-testid="entry-pii"]')).toBeVisible()
    // My info survives a new round.
    await expect(page.locator('[data-testid="myinfo-person-self"]')).toContainText('患者A')
  })

  // Text recognition is paused (ADR-0013). Both halves stay, so flipping OCR_ENABLED keeps this test meaningful.
  const documentTitle = OCR_ENABLED
    ? 'a text PDF and a photo are read on this computer and share one code per person'
    : 'a text PDF is read on this computer; a photo is turned away while text recognition is paused'
  test(documentTitle, async () => {
    test.skip(process.platform !== 'darwin', 'Reading PDFs and photos is macOS only')
    await useChinese()
    await openRedaction()
    // Synthetic fixtures made by native/docreader/make-fixtures.swift; 测试甲 is not a real person.
    expect(await page.evaluate(() => window.api.getModelStatus())).toMatchObject({ exists: false, loaded: false })
    const files = [
      { path: join(__dirname, 'fixtures', 'redact', 'synthetic-report.pdf'), name: 'synthetic-report.pdf' },
      { path: join(__dirname, 'fixtures', 'redact', 'synthetic-report-photo.png'), name: 'synthetic-report-photo.png' },
    ]
    await page.evaluate((list) => {
      window.dispatchEvent(new CustomEvent('cellsentry:test-drop', { detail: { files: list.map((file) => ({ ...file, size: 0 })) } }))
    }, files)
    if (OCR_ENABLED) {
      // A clean read moves on to review by itself.
      await expect(page.locator('[data-testid="redact-review"]')).toBeVisible({ timeout: 60000 })
    } else {
      // The photo needs text recognition: it stays on screen with the reason, and nothing jumps away.
      const photo = page.locator('[data-testid="redact-file-1"]')
      await expect(photo).toHaveAttribute('data-status', 'error', { timeout: 60000 })
      await expect(photo.locator('[data-testid="redact-file-error"]')).toHaveAttribute('data-code', 'needs_ocr')
      await expect(photo).toContainText('需要识别文字')
      await expect(page.locator('[data-testid="redact-file-0"]')).toHaveAttribute('data-status', 'done')
      await page.locator('[data-testid="redact-read-continue"]').click()
      await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()
    }
    await page.locator('[data-testid="redact-review-next"]').click()
    await expect(page.locator('[data-testid="redact-residue"]')).toHaveAttribute('data-count', '0')
    const shared = (await page.locator('[data-testid="redact-share-text"]').innerText())
    expect(shared).toContain('【文件 1】')
    expect(shared).not.toContain('测试甲')
    expect(shared).not.toContain('13800000000')
    expect(shared).not.toContain('synthetic-report')
    expect(shared).toContain('总胆固醇')
    const codes = [...shared.matchAll(/姓名：(患者[A-Z]+)/g)].map((match) => match[1])
    if (OCR_ENABLED) {
      expect(shared).toContain('【文件 2】')
      expect(codes).toHaveLength(2)
      expect(codes[0]).toBe(codes[1])
    } else {
      expect(shared).not.toContain('【文件 2】')
      expect(codes).toHaveLength(1)
    }
    await page.getByTestId('redact-copy').click()
    expect(await ctx.app.evaluate(() => (globalThis as { __cellsentryTestClipboard?: string }).__cellsentryTestClipboard)).toBe(shared)
    await page.locator('[data-testid="redact-share-next"]').click()
    await page.getByTestId('redact-answer').fill(`${codes[0]} 的总胆固醇需要复查。`)
    await expect(page.getByTestId('redact-restored-text')).toContainText('测试甲 的总胆固醇需要复查。')
    await page.locator('[data-testid="redact-start-over"]').click()
    await page.locator('[data-testid="redact-start-over-yes"]').click()
    await expect(page.locator('[data-testid="entry-pii"]')).toBeVisible()
  })

  test('a spot kept only by default blocks copying until the user decides on it', async () => {
    await openRedaction()
    // "My info" holds 张伟 (first test); inside 张伟华 it is probably someone else, so it is kept by default and asked about.
    await pasteAndStart('姓名：张伟\n复查人：张伟华')
    await page.locator('[data-testid="redact-review-next"]').click()
    const residue = page.locator('[data-testid="redact-residue"]')
    await expect(residue).toHaveAttribute('data-count', '1')
    await expect(residue).toContainText('张伟')
    await expect(page.locator('[data-testid="redact-copy"]')).toBeDisabled()
    await expect(page.locator('[data-testid="redact-save"]')).toBeDisabled()
    // Copying or dragging a selection by hand is blocked too, even one that starts outside the text (Cmd+A).
    expect((await selectAllAnd('copy')).blocked).toBe(true)
    expect((await selectAllAnd('drag')).blocked).toBe(true)
    await expect(page.locator('[data-testid="redact-copy-blocked"]')).toBeVisible()
    // The review page's replaced preview is the same text, so it follows the same rule.
    await page.locator('[data-testid="redact-share"]').getByRole('button', { name: '回去复核' }).last().click()
    await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()
    expect((await selectAllAnd('copy')).blocked).toBe(true)
    await expect(page.locator('[data-testid="redact-review-copy-blocked"]')).toBeVisible()
    await page.locator('[data-testid="redact-review-next"]').click()
    // Deciding on that exact spot unblocks copying and leaves the text as it is.
    await page.locator('[data-testid="redact-residue-not-pii"]').click()
    await expect(residue).toHaveAttribute('data-count', '0')
    const shared = page.locator('[data-testid="redact-share-text"]')
    await expect(shared).toContainText('姓名：患者A')
    await expect(shared).toContainText('复查人：张伟华')
    await expect(page.locator('[data-testid="redact-copy"]')).toBeEnabled()
    // Dragging the text out now works, lets out the shareable text only, and freezes the code list.
    const shareText = await page.locator('[data-testid="redact-share-text"]').evaluate((node) => node.textContent ?? '')
    expect(await selectAllAnd('drag')).toEqual({ blocked: false, text: shareText })
    await page.locator('[data-testid="redact-share-next"]').click()
    await expect(page.locator('[data-testid="redact-restore"]')).toBeVisible()
    await expect(page.locator('[data-testid="redact-restore-not-shared"]')).toHaveCount(0)
    // Select All and copy lets out the shareable text only, never the code list beside it.
    await page.getByRole('button', { name: '回到分享版本' }).click()
    await expect(page.locator('[data-testid="redact-share"]')).toBeVisible()
    expect(await selectAllAnd('copy')).toEqual({ blocked: false, text: shareText })
  })

  test('a number glued to letters gets the same code without any leftover', async () => {
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.locator('[data-testid="home-task-pii"]').click()
    await page.locator('[data-testid="redact-paste-toggle"]').click()
    await page.locator('[data-testid="redact-paste-input"]').fill('家属电话：13700001111\n快递单备注：TEL13700001111')
    await page.locator('[data-testid="redact-paste-start"]').click()
    await page.locator('[data-testid="redact-confirm-new-yes"]').click()
    await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()
    await page.locator('[data-testid="redact-review-next"]').click()
    await expect(page.locator('[data-testid="redact-residue"]')).toHaveAttribute('data-count', '0')
    const shared = page.locator('[data-testid="redact-share-text"]')
    await expect(shared).toContainText('快递单备注：TEL电话1')
    await expect(shared).not.toContainText('13700001111')
  })

  test('the code list is frozen once the shareable text is copied', async () => {
    // During a round the sidebar returns to it; the home card opens the entry page, which says a round is open.
    await page.locator('[data-testid="sidebar-nav-home"]').click()
    await page.locator('[data-testid="home-task-pii"]').click()
    await expect(page.locator('[data-testid="redact-round-active"]')).toBeVisible()
    await page.locator('[data-testid="redact-paste-toggle"]').click()
    await page.locator('[data-testid="redact-paste-input"]').fill('联系电话：13700001111')
    await page.locator('[data-testid="redact-paste-start"]').click()
    // A round is still open, so starting a new one asks first.
    await page.locator('[data-testid="redact-confirm-new-yes"]').click()
    await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()
    await page.locator('[data-testid="redact-review-next"]').click()
    await page.locator('[data-testid="redact-copy"]').click()
    await expect(page.locator('[data-testid="redact-copy"]')).toContainText('已复制')
    await expect(page.locator('[data-testid="redact-share-changed"]')).toHaveCount(0)

    // Going back to the files page keeps the round; nothing is lost until the user confirms a new one.
    await page.locator('[data-testid="redact-share"]').getByRole('button', { name: '回去复核' }).last().click()
    await page.locator('[data-testid="redact-review-back"]').click()
    await expect(page.locator('[data-testid="redact-round-active"]')).toBeVisible()
    await page.locator('[data-testid="redact-back-to-round"]').click()
    await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()

    // Changing a decision after copying warns, and restore still uses the copied code list.
    await page.locator('[data-testid="sidebar-nav-pii"]').click()
    await expect(page.locator('[data-testid="redact-review"]')).toBeVisible()
    await page.locator('[data-testid="redact-group"]').first().locator('.redact-link').click()
    await page.locator('[data-testid="redact-review-next"]').click()
    await expect(page.locator('[data-testid="redact-share-changed"]')).toBeVisible()
    await page.locator('[data-testid="redact-share-next"]').click()
    await expect(page.locator('[data-testid="redact-restore-changed"]')).toBeVisible()
    await page.locator('[data-testid="redact-answer"]').fill('电话1 已经停机了。')
    await expect(page.locator('[data-testid="redact-restored-text"]')).toContainText('13700001111 已经停机了。')
  })
})
