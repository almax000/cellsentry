import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'
import { join } from 'path'

let ctx: TestContext
let page: Page

const screenshotDir = join(__dirname, '..', '..', 'test_evidence', 'screenshots')

test.beforeAll(async () => {
  ctx = await launchApp()
  page = ctx.page
})

test.afterAll(async () => {
  if (ctx) await teardownApp(ctx)
})

test('sidebar is 72px wide with no logo element', async () => {
  const sidebar = page.locator('.sidebar')
  await expect(sidebar).toBeVisible()

  const width = await sidebar.evaluate((el) => el.getBoundingClientRect().width)
  expect(width).toBe(72)

  // Logo was removed — sidebar-logo should not exist
  await expect(page.locator('.sidebar-logo')).toHaveCount(0)
})

test('sidebar items are 48x48 with 24px icons', async () => {
  const item = page.locator('.sidebar-item').first()
  await expect(item).toBeVisible()

  const box = await item.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(box.width).toBe(48)
  expect(box.height).toBe(48)

  const svg = item.locator('svg')
  await expect(svg).toHaveAttribute('width', '24')
  await expect(svg).toHaveAttribute('height', '24')
})

test('header shows feature icon (not app brand)', async () => {
  const icon = page.locator('.header-title svg')
  await expect(icon).toBeVisible()

  // On the home page, should be the grid/spreadsheet icon (has a rect + path)
  const rect = icon.locator('rect')
  await expect(rect).toBeVisible()
})

test('header has always-dark chrome background', async () => {
  const header = page.locator('.main-header')
  const bg = await header.evaluate(
    (el) => window.getComputedStyle(el).backgroundColor
  )
  // --chrome-bg: #0f1117 → rgb(15, 17, 23)
  expect(bg).toBe('rgb(15, 17, 23)')
})

test('header has no theme toggle button', async () => {
  // Theme toggle was moved to Settings — header should have no btn-icon for toggling
  const headerBtnIcons = page.locator('.main-header .header-actions .btn-icon')
  await expect(headerBtnIcons).toHaveCount(0)
})

test('header has drag region', async () => {
  const header = page.locator('.main-header')
  const appRegion = await header.evaluate(
    (el) => window.getComputedStyle(el).getPropertyValue('-webkit-app-region')
  )
  expect(appRegion).toBe('drag')
})

test('sidebar top has drag region', async () => {
  const sidebar = page.locator('.sidebar')
  const pseudoBefore = await sidebar.evaluate((el) => {
    const style = window.getComputedStyle(el, '::before')
    return {
      appRegion: style.getPropertyValue('-webkit-app-region'),
      height: style.getPropertyValue('height'),
      position: style.getPropertyValue('position')
    }
  })
  expect(pseudoBefore.appRegion).toBe('drag')
  expect(pseudoBefore.position).toBe('absolute')
})

test('app layout has platform class', async () => {
  const layout = page.locator('.app-layout')
  const className = await layout.getAttribute('class')
  expect(className).toMatch(/platform-(darwin|win32|linux)/)
})

test('drop zone buttons are inside dashed border', async () => {
  const actionsInsideDropZone = page.locator('.drop-zone .drop-zone-actions')
  await expect(actionsInsideDropZone).toBeVisible()

  const buttons = actionsInsideDropZone.locator('button')
  await expect(buttons).toHaveCount(2)
})

test('full app screenshot', async () => {
  await page.screenshot({
    path: join(screenshotDir, 'app-full.png'),
    fullPage: false
  })
})
