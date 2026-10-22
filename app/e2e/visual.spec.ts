import { test, expect } from '@playwright/test'
import { launchApp, teardownApp, type TestContext } from './electron.setup'
import type { Page } from '@playwright/test'

let ctx: TestContext
let page: Page

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

  // Home button should exist at top of sidebar
  await expect(page.locator('[data-testid="sidebar-nav-home"]')).toBeVisible()
})

test('sidebar items are 56px wide with an icon above a text label', async () => {
  // Home button has a 26px mark
  const home = page.locator('[data-testid="sidebar-nav-home"]')
  await expect(home).toBeVisible()
  const homeSvg = home.locator('svg')
  await expect(homeSvg).toHaveAttribute('width', '26')
  await expect(homeSvg).toHaveAttribute('height', '26')

  // Task items have 22px icons and a visible label, redaction first
  const order = await page.locator('.sidebar-nav .sidebar-item').evaluateAll((items) => items.map((item) => item.getAttribute('data-testid')))
  expect(order).toEqual(['sidebar-nav-home', 'sidebar-nav-pii', 'sidebar-nav-audit', 'sidebar-nav-extraction'])

  const auditItem = page.locator('[data-testid="sidebar-nav-audit"]')
  const box = await auditItem.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(box.width).toBe(56)
  expect(box.height).toBeGreaterThanOrEqual(52)
  await expect(auditItem.locator('.sidebar-label')).toBeVisible()

  const svg = auditItem.locator('svg')
  await expect(svg).toHaveAttribute('width', '22')
  await expect(svg).toHaveAttribute('height', '22')
})

test('header carries the persistent local-only badge', async () => {
  const badge = page.locator('[data-testid="local-only-badge"]')
  await expect(badge).toBeVisible()
  await badge.click()
  await expect(page.locator('.local-only-popover')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.local-only-popover')).toHaveCount(0)
})

test('header shows feature icon (not app brand) on a task entry page', async () => {
  await page.locator('[data-testid="sidebar-nav-audit"]').click()
  await expect(page.locator('[data-testid="entry-audit"]')).toBeVisible()
  const icon = page.locator('.header-title svg')
  await expect(icon).toBeVisible()

  // The formula-check entry uses the grid/spreadsheet icon (has a rect + path)
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

test('home surface is visible for Playwright failure evidence', async () => {
  await page.locator('[data-testid="sidebar-nav-home"]').click()
  await expect(page.locator('[data-testid="home-page"]')).toBeVisible()
})
