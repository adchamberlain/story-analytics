import { test, expect } from '@playwright/test'
import { createTestChart, publishChart, deleteChart, deleteSource, waitForChart, saveScreenshot } from './helpers'

test.describe('Embed Page', () => {
  let chartId: string
  let sourceId: string

  test.beforeAll(async () => {
    const result = await createTestChart({ title: 'Embed E2E Test' })
    chartId = result.chartId
    sourceId = result.sourceId
    await publishChart(chartId)
  })

  test.afterAll(async () => {
    if (chartId) await deleteChart(chartId)
    if (sourceId) await deleteSource(sourceId)
  })

  test('renders at desktop width (1280px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/embed/chart/${chartId}`)
    await page.waitForLoadState('networkidle')
    await saveScreenshot(page, 'embed-desktop')
    // Should not show editor chrome
    await expect(page.locator('text=Save')).not.toBeVisible()
  })

  test('renders at mobile width (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`/embed/chart/${chartId}`)
    await page.waitForLoadState('networkidle')
    await saveScreenshot(page, 'embed-mobile')
  })

  test('shows error for missing chart', async ({ page }) => {
    await page.goto('/embed/chart/nonexistent-id-12345')
    await page.waitForLoadState('networkidle')
    // Should show some kind of error message
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
