/**
 * Visual audit script: screenshots every chart type × every theme combination.
 * Run with: npx tsx e2e/audit-templates.ts
 *
 * Saves ~99 screenshots to tasks/screenshots/audit/{theme}-{chartType}.png
 */
import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCREENSHOT_DIR = path.resolve(__dirname, '../../tasks/screenshots/audit')

const API_BASE = 'http://localhost:8000'
const FRONTEND_BASE = 'http://localhost:3001'

const THEME_IDS = [
  'default', 'economist', 'minimal', 'nyt', 'nature',
  'fivethirtyeight', 'academic', 'dark', 'pastel',
]

interface ChartSpec {
  type: string
  name: string
  csv: string
  sql: string
  x: string
  y: string | string[]
  series?: string
  config?: Record<string, unknown>
}

const CHART_SPECS: ChartSpec[] = [
  {
    type: 'BarChart',
    name: 'bar',
    csv: 'category,value\nAlpha,42\nBeta,67\nGamma,28\nDelta,55\nEpsilon,38',
    sql: 'SELECT category, value FROM data',
    x: 'category',
    y: 'value',
  },
  {
    type: 'LineChart',
    name: 'line',
    csv: 'month,series,value\n2024-01,A,10\n2024-02,A,25\n2024-03,A,18\n2024-04,A,32\n2024-05,A,28\n2024-06,A,35\n2024-01,B,22\n2024-02,B,15\n2024-03,B,30\n2024-04,B,20\n2024-05,B,40\n2024-06,B,33\n2024-01,C,5\n2024-02,C,12\n2024-03,C,8\n2024-04,C,15\n2024-05,C,22\n2024-06,C,18',
    sql: 'SELECT month, series, value FROM data ORDER BY month',
    x: 'month',
    y: 'value',
    series: 'series',
  },
  {
    type: 'AreaChart',
    name: 'area',
    csv: 'month,series,value\n2024-01,Revenue,100\n2024-02,Revenue,120\n2024-03,Revenue,115\n2024-04,Revenue,140\n2024-05,Revenue,155\n2024-06,Revenue,170\n2024-01,Costs,60\n2024-02,Costs,65\n2024-03,Costs,70\n2024-04,Costs,72\n2024-05,Costs,80\n2024-06,Costs,85\n2024-01,Profit,40\n2024-02,Profit,55\n2024-03,Profit,45\n2024-04,Profit,68\n2024-05,Profit,75\n2024-06,Profit,85',
    sql: 'SELECT month, series, value FROM data ORDER BY month',
    x: 'month',
    y: 'value',
    series: 'series',
  },
  {
    type: 'ScatterPlot',
    name: 'scatter',
    csv: 'x,y,grp\n1,4,A\n2,7,A\n3,5,A\n4,9,A\n5,6,A\n1.5,8,B\n2.5,3,B\n3.5,6,B\n4.5,4,B\n5.5,9,B\n0.5,5,C\n2,9,C\n3,3,C\n4,7,C\n5,8,C',
    sql: 'SELECT x, y, grp FROM data',
    x: 'x',
    y: 'y',
    series: 'grp',
  },
  {
    type: 'Histogram',
    name: 'histogram',
    csv: 'value\n12\n15\n18\n22\n25\n28\n30\n32\n35\n38\n40\n42\n45\n48\n50\n22\n25\n30\n35\n40\n28\n32\n38',
    sql: 'SELECT value FROM data',
    x: 'value',
    y: 'value',
  },
  {
    type: 'HeatMap',
    name: 'heatmap',
    csv: 'day,hour,intensity\nMon,9,5\nMon,10,8\nMon,11,12\nMon,14,9\nTue,9,3\nTue,10,7\nTue,11,15\nTue,14,11\nWed,9,6\nWed,10,10\nWed,11,8\nWed,14,13\nThu,9,4\nThu,10,9\nThu,11,14\nThu,14,7\nFri,9,2\nFri,10,5\nFri,11,11\nFri,14,6',
    sql: 'SELECT day, hour, intensity FROM data',
    x: 'day',
    y: 'intensity',
    series: 'hour',
  },
  {
    type: 'BoxPlot',
    name: 'boxplot',
    csv: 'category,value\nA,10\nA,15\nA,20\nA,25\nA,30\nA,35\nA,12\nA,28\nB,20\nB,25\nB,30\nB,35\nB,40\nB,45\nB,22\nB,38\nC,5\nC,10\nC,15\nC,20\nC,25\nC,30\nC,8\nC,18',
    sql: 'SELECT category, value FROM data',
    x: 'category',
    y: 'value',
  },
  {
    type: 'PieChart',
    name: 'pie',
    csv: 'category,value\nDesktop,45\nMobile,30\nTablet,15\nOther,10',
    sql: 'SELECT category, value FROM data',
    x: 'category',
    y: 'value',
  },
  {
    type: 'Treemap',
    name: 'treemap',
    csv: 'category,value\nEngineering,120\nDesign,45\nMarketing,80\nSales,95\nSupport,35\nOps,50',
    sql: 'SELECT category, value FROM data',
    x: 'category',
    y: 'value',
  },
  {
    type: 'BigValue',
    name: 'bigvalue',
    csv: 'metric,value\nRevenue,142500',
    sql: 'SELECT metric, value FROM data',
    x: 'metric',
    y: 'value',
    config: { value: 'value', metricLabel: 'Revenue', valueFormat: { prefix: '$', suffix: '', decimals: 0 } },
  },
  {
    type: 'DataTable',
    name: 'datatable',
    csv: 'name,department,salary,rating\nAlice,Engineering,120000,4.5\nBob,Design,95000,4.2\nCarol,Marketing,85000,4.8\nDave,Sales,110000,3.9\nEve,Support,75000,4.6',
    sql: 'SELECT name, department, salary, rating FROM data',
    x: 'name',
    y: 'salary',
  },
]

async function uploadCsv(csv: string, label: string): Promise<string> {
  const filename = `audit-${label}-${Date.now()}.csv`
  const formData = new FormData()
  formData.append('file', new Blob([csv], { type: 'text/csv' }), filename)

  const res = await fetch(`${API_BASE}/api/data/upload`, {
    method: 'POST',
    body: formData,
  })
  const result = await res.json()
  return result.source_id ?? result.detail?.existing_source_id
}

async function createChart(spec: ChartSpec, sourceId: string): Promise<string> {
  const body: Record<string, unknown> = {
    source_id: sourceId,
    chart_type: spec.type,
    title: `${spec.type} Audit`,
    sql: spec.sql,
    x: spec.x,
    y: spec.y,
    series: spec.series ?? null,
    config: spec.config ?? {},
  }

  const res = await fetch(`${API_BASE}/api/v2/charts/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await res.json()
  if (!result.id) throw new Error(`Failed to create ${spec.type}: ${JSON.stringify(result)}`)
  return result.id
}

async function publishChart(chartId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v2/charts/${chartId}/publish`, { method: 'PUT' })
}

async function deleteChart(chartId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v2/charts/${chartId}`, { method: 'DELETE' })
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  console.log('Creating charts...')
  const chartIds: Record<string, string> = {}

  for (const spec of CHART_SPECS) {
    try {
      const sourceId = await uploadCsv(spec.csv, spec.name)
      const chartId = await createChart(spec, sourceId)
      await publishChart(chartId)
      chartIds[spec.name] = chartId
      console.log(`  ✓ ${spec.name} → ${chartId}`)
    } catch (e) {
      console.error(`  ✗ ${spec.name}:`, e)
    }
  }

  console.log(`\nCreated ${Object.keys(chartIds).length} charts. Taking screenshots...`)

  const browser = await chromium.launch()
  let count = 0
  const total = THEME_IDS.length * Object.keys(chartIds).length

  for (const themeId of THEME_IDS) {
    for (const [chartName, chartId] of Object.entries(chartIds)) {
      const context = await browser.newContext({
        viewport: { width: 800, height: 600 },
      })

      // Set chart theme in localStorage before page loads
      await context.addInitScript((theme) => {
        localStorage.setItem('chartTheme', theme)
      }, themeId)

      const page = await context.newPage()
      await page.goto(`${FRONTEND_BASE}/embed/chart/${chartId}`, {
        waitUntil: 'networkidle',
      })
      await page.waitForTimeout(600)

      const screenshotPath = path.join(SCREENSHOT_DIR, `${themeId}-${chartName}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      count++

      await context.close()

      if (count % 11 === 0 || count === total) {
        console.log(`  ${count}/${total} screenshots captured`)
      }
    }
  }

  await browser.close()
  console.log(`\nDone! ${count} screenshots saved to tasks/screenshots/audit/`)

  // Cleanup charts
  console.log('Cleaning up charts...')
  for (const id of Object.values(chartIds)) {
    await deleteChart(id).catch(() => {})
  }
  console.log('Cleanup complete.')
}

main().catch(console.error)
