import { test } from '@playwright/test'
import { createTestChart, publishChart, deleteChart, saveScreenshot } from './helpers'

const THEME_IDS = [
  'default',
  'economist',
  'minimal',
  'nyt',
  'nature',
  'fivethirtyeight',
  'academic',
  'dark',
  'pastel',
]

test.describe('Theme Screenshots', () => {
  let chartId: string

  test.beforeAll(async () => {
    chartId = await createTestChart({ title: 'Theme Showcase' })
    await publishChart(chartId)
  })

  test.afterAll(async () => {
    if (chartId) await deleteChart(chartId).catch(() => {})
  })

  for (const themeId of THEME_IDS) {
    test(`screenshot with ${themeId} theme`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      // Navigate to embed with theme query param
      await page.goto(`/embed/chart/${chartId}?theme=${themeId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      await saveScreenshot(page, `theme-${themeId}`)
    })
  }
})
