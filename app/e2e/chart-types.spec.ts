import { test } from '@playwright/test'
import { createTestChart, publishChart, deleteChart, deleteSource, waitForChart, saveScreenshot } from './helpers'

const CHART_TYPES = [
  { type: 'BarChart', name: 'bar' },
  { type: 'LineChart', name: 'line' },
  { type: 'PieChart', name: 'pie' },
] as const

test.describe('Chart Type Screenshots', () => {
  const chartIds: string[] = []
  const sourceIds: string[] = []

  test.afterAll(async () => {
    for (const id of chartIds) {
      await deleteChart(id).catch(() => {})
    }
    for (const id of sourceIds) {
      await deleteSource(id).catch(() => {})
    }
  })

  for (const { type, name } of CHART_TYPES) {
    test(`screenshot ${name} chart`, async ({ page }) => {
      const { chartId: id, sourceId } = await createTestChart({ title: `${name} E2E`, chartType: type })
      chartIds.push(id)
      sourceIds.push(sourceId)
      await publishChart(id)

      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(`/embed/chart/${id}`)
      await page.waitForLoadState('networkidle')
      // Give charts a moment to render SVG
      await page.waitForTimeout(1000)
      await saveScreenshot(page, `chart-type-${name}`)
    })
  }
})
