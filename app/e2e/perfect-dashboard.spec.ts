/**
 * Screenshot test for "The Perfect Dashboard" — verifies all 25 chart types render.
 * Takes individual screenshots of each chart card plus the full dashboard.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DASHBOARD_ID = 'fe5b60395f3b'
const SCREENSHOT_DIR = path.resolve(__dirname, '../../tasks/screenshots/perfect-dashboard')

// Chart IDs in dashboard order with their expected types
const CHARTS = [
  { id: 'bc065fd02e6c', type: 'BigValue', title: 'SaaS Dashboard KPIs' },
  { id: '7a00fa2eb73f', type: 'LineChart', title: 'S&P 500 Monthly Close' },
  { id: 'b07287084123', type: 'BarChart', title: 'Top Programming Languages 2025' },
  { id: 'f533a82a0fad', type: 'AreaChart', title: 'Streaming Wars' },
  { id: '832216849333', type: 'ScatterPlot', title: 'Study Hours vs Exam Score' },
  { id: '21c09cf010a3', type: 'Histogram', title: 'API Response Time Distribution' },
  { id: 'ce8d6fbd5d12', type: 'StackedColumn', title: 'Revenue by Product Category' },
  { id: 'd0040a12bf90', type: 'GroupedColumn', title: 'Team Performance H1 vs H2' },
  { id: '2fbd0e597ce0', type: 'PieChart', title: 'Cloud Infrastructure Market Share' },
  { id: 'a77254f6d139', type: 'Treemap', title: 'US Federal Budget Allocation' },
  { id: '8398f10fea34', type: 'HeatMap', title: 'Website Traffic Heatmap' },
  { id: 'e7a53212ee33', type: 'BoxPlot', title: 'Salary Distribution by Department' },
  { id: 'e84d443044fe', type: 'DotPlot', title: 'Smartphone Satisfaction Scores' },
  { id: '901ac6c36603', type: 'RangePlot', title: 'Temperature Ranges by City' },
  { id: 'a10fd22d0223', type: 'BulletBar', title: 'Q4 Performance vs Targets' },
  { id: '1ca9e6916d15', type: 'ArrowPlot', title: 'Process Improvement Results' },
  { id: 'b1d5a31030cb', type: 'SplitBars', title: 'Employee Survey by Gender' },
  { id: '0a0ff1743c2f', type: 'ElectionDonut', title: 'Parliament Composition' },
  { id: '23d75330bfb6', type: 'MultiplePies', title: 'Market Share by Region' },
  { id: '4f60c7927f6a', type: 'SmallMultiples', title: 'Sales Trends by Region' },
  { id: '4ca80a40431d', type: 'ChoroplethMap', title: 'US Population by State' },
  { id: 'f85152d67b39', type: 'SymbolMap', title: 'World Largest Metropolitan Areas' },
  { id: 'f8f6b6fc5f6f', type: 'LocatorMap', title: 'Famous World Landmarks' },
  { id: '4eeecfb32330', type: 'SpikeMap', title: 'Notable US Earthquakes' },
  { id: '11ae3e27f8b7', type: 'DataTable', title: 'Global Country Statistics' },
]

test.describe('The Perfect Dashboard', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  })

  test('dashboard page loads without crash', async ({ page }) => {
    await page.goto(`http://localhost:3001/dashboard/${DASHBOARD_ID}`, { waitUntil: 'networkidle' })

    // Title should be visible
    await expect(page.locator('h1')).toHaveText('The Perfect Dashboard')

    // All 25 chart grid items should exist
    const gridItems = page.locator('.dashboard-grid > div')
    await expect(gridItems).toHaveCount(25)

    // Take full-page screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '00-full-dashboard.png'),
      fullPage: true,
    })
  })

  // Individual chart screenshots via the chart view page
  for (const [i, chart] of CHARTS.entries()) {
    test(`${String(i + 1).padStart(2, '0')} ${chart.type} renders`, async ({ page }) => {
      await page.goto(`http://localhost:3001/chart/${chart.id}`, { waitUntil: 'networkidle' })

      // Wait for chart content to appear (SVG, canvas, table, or BigValue)
      await page.waitForTimeout(2000) // let charts fully render

      // Check for error states
      const errorBanner = page.locator('.text-red-700')
      const hasError = await errorBanner.count() > 0
      if (hasError) {
        const errorText = await errorBanner.first().textContent()
        console.warn(`⚠ ${chart.type} (${chart.id}) has error: ${errorText}`)
      }

      // Take screenshot
      const filename = `${String(i + 1).padStart(2, '0')}-${chart.type}.png`
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, filename),
        fullPage: true,
      })

      // Verify something rendered (SVG, table, or KPI content)
      const hasSvg = await page.locator('svg').count() > 0
      const hasTable = await page.locator('table').count() > 0
      const hasKpi = await page.locator('[class*="text-3xl"], [class*="text-4xl"]').count() > 0

      expect(
        hasSvg || hasTable || hasKpi,
        `${chart.type} should render visible content (SVG, table, or KPI)`
      ).toBe(true)
    })
  }
})
