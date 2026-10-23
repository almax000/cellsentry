import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { launchApp, teardownApp, type TestContext } from './electron.setup'

// Synthetic content only. Failure injection stays at IPC; no native dialogs or system clipboard.
let ctx: TestContext
test.beforeEach(async () => {
  ctx = await launchApp()
  await ctx.page.getByTestId('sidebar-nav-settings').click()
  await ctx.page.getByTestId('settings-lang-select').selectOption('zh')
  await ctx.page.getByTestId('sidebar-nav-pii').click()
})
test.afterEach(async () => { if (ctx) await teardownApp(ctx) })

async function paste(text: string): Promise<void> {
  await ctx.page.getByTestId('redact-paste-toggle').click()
  await ctx.page.getByTestId('redact-paste-input').fill(text)
  await ctx.page.getByTestId('redact-paste-start').click()
  await expect(ctx.page.getByTestId('redact-review')).toBeVisible()
}
async function drop(): Promise<void> {
  await ctx.page.evaluate(() => window.dispatchEvent(new CustomEvent('cellsentry:test-drop', {
    detail: { files: [{ path: '/synthetic/fixture.pdf', name: 'fixture.pdf', size: 0 }] },
  })))
}

test('a missing reader blocks review and lets the user return safely', async () => {
  await ctx.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('redact:read')
    ipcMain.handle('redact:read', () => ({ ok: false, error: 'reader_missing' }))
  })
  await drop()
  await expect(ctx.page.getByTestId('redact-read-failure')).toBeVisible()
  await expect(ctx.page.getByTestId('redact-read-continue')).toHaveCount(0)
  await ctx.page.getByTestId('redact-read-back').click()
  await expect(ctx.page.getByTestId('entry-pii')).toBeVisible()
})

test('stopping a partial read requires an explicit choice before sharing the pages read', async () => {
  await ctx.app.evaluate(({ ipcMain }) => {
    let finish: (value: unknown) => void
    const state = globalThis as typeof globalThis & { __partialReadStarted?: boolean }
    state.__partialReadStarted = false
    ipcMain.removeHandler('redact:read')
    ipcMain.handle('redact:read', () => new Promise(resolve => { finish = resolve; state.__partialReadStarted = true }))
    ipcMain.removeHandler('redact:read-cancel')
    ipcMain.handle('redact:read-cancel', () => finish({ ok: true, canceled: true, documents: [{
      path: '/synthetic/fixture.pdf', name: 'fixture.pdf', kind: 'pdf',
      pages: [{ page: 1, text: '联系电话：13800000000\n总胆固醇 6.2 mmol/L', source: 'text' }],
      errors: [{ page: 2, code: 'stopped' }],
    }] }))
  })
  await drop()
  await expect.poll(() => ctx.app.evaluate(() => (globalThis as typeof globalThis & { __partialReadStarted?: boolean }).__partialReadStarted)).toBe(true)
  await ctx.page.getByTestId('redact-read-cancel').click()
  await expect(ctx.page.getByTestId('redact-file-error')).toHaveAttribute('data-code', 'stopped')
  await expect(ctx.page.getByTestId('redact-review')).toHaveCount(0)
  await ctx.page.getByTestId('redact-read-continue').click()
  await ctx.page.getByTestId('redact-review-next').click()
  await expect(ctx.page.getByTestId('redact-residue')).toHaveAttribute('data-count', '0')
  await expect(ctx.page.getByTestId('redact-share-text')).toContainText('总胆固醇 6.2 mmol/L')
  await expect(ctx.page.getByTestId('redact-share-text')).not.toContainText('13800000000')
})

for (const outcome of ['saved', 'canceled', 'write_failed'] as const) {
  test(`saving shareable text handles ${outcome} without falsely freezing the code list`, async () => {
    const output = await ctx.app.evaluate(({ app, dialog }, result) => {
      const target = app.getPath('userData') + (result === 'write_failed' ? '/missing-parent/shareable.txt' : '/shareable.txt')
      dialog.showSaveDialog = async () => ({ canceled: result === 'canceled', filePath: target })
      return target
    }, outcome)
    await paste('联系电话：13800000000\n总胆固醇 6.2 mmol/L')
    await ctx.page.getByTestId('redact-review-next').click()
    const shared = await ctx.page.getByTestId('redact-share-text').innerText()
    await ctx.page.getByTestId('redact-save').click()
    if (outcome === 'saved') {
      await expect(ctx.page.getByTestId('redact-save')).toHaveText('已保存')
      expect(readFileSync(output, 'utf8')).toBe(shared)
    } else if (outcome === 'write_failed') {
      await expect(ctx.page.getByTestId('redact-save')).toContainText('没能')
    } else {
      await expect(ctx.page.getByTestId('redact-save')).toHaveText('存成文本文件')
    }
    await ctx.page.getByTestId('redact-share-next').click()
    await expect(ctx.page.getByTestId('redact-restore-not-shared')).toHaveCount(outcome === 'saved' ? 0 : 1)
    await ctx.page.getByTestId('redact-answer').fill('电话1 建议复查。')
    await expect(ctx.page.getByTestId('redact-restored-text')).toContainText('13800000000 建议复查。')
  })
}

test('address variants share one code and explain canonical restoration', async () => {
  const street = '浙江省杭州市西湖区文三路100号'
  await ctx.page.getByTestId('myinfo-edit-self').click()
  await ctx.page.getByTestId('myinfo-input-address').fill(street)
  await ctx.page.getByTestId('myinfo-save').click()
  const first = `“${street}”3栋501室`
  await paste(`${first}，复诊“${street}” 3栋501室`)
  await ctx.page.getByTestId('redact-review-next').click()
  await expect(ctx.page.getByTestId('redact-share-text')).toHaveText('【文件 1】\n地址1，复诊地址1')
  await ctx.page.getByTestId('redact-copy').click()
  await ctx.page.getByTestId('redact-share-next').click()
  await ctx.page.getByTestId('redact-answer').fill('地址1，复诊地址1')
  await expect(ctx.page.getByTestId('redact-restored-text')).toHaveText(`${first}，复诊${first}`)
  await expect(ctx.page.getByTestId('redact-canonical-restore')).toContainText('不会逐字保留')
  const screenshots = join(__dirname, '..', 'tmp', 'e2e', 'release-acceptance')
  mkdirSync(screenshots, { recursive: true })
  for (const [width, height] of [[1200, 800], [800, 600]]) {
    await ctx.app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), [width, height])
    await ctx.page.getByTestId('redact-canonical-restore').scrollIntoViewIfNeeded()
    await ctx.page.screenshot({ path: join(screenshots, `canonical-${width}x${height}.png`), animations: 'disabled' })
  }
})

test('a profile write failure is visible and leaves the current round usable', async () => {
  await ctx.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('redact:profile-save')
    ipcMain.handle('redact:profile-save', () => ({ ok: false, persisted: false, error: 'write_failed' }))
  })
  await ctx.page.getByTestId('myinfo-edit-self').click()
  await ctx.page.getByTestId('myinfo-input-name').fill('测试甲')
  await ctx.page.getByTestId('myinfo-save').click()
  await expect(ctx.page.getByTestId('myinfo-panel')).toContainText('没能保存')
  await expect(ctx.page.getByTestId('myinfo-panel')).toContainText('只在这次打开期间记住')
  await paste('姓名：测试甲\n总胆固醇 6.2 mmol/L')
  await ctx.page.getByTestId('redact-review-next').click()
  await expect(ctx.page.getByTestId('redact-share-text')).toContainText('患者A')
  await expect(ctx.page.getByTestId('redact-share-text')).not.toContainText('测试甲')
})
