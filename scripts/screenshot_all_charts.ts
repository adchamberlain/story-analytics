/**
 * Screenshot all 25 charts from The Perfect Dashboard.
 * Usage: npx playwright test --config=app/e2e/playwright.config.ts scripts/screenshot_all_charts.ts
 * Or: npx tsx scripts/screenshot_all_charts.ts
 */
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const DASHBOARD_ID = 'fe5b60395f3b'
const OUT_DIR = path.resolve('tasks/screenshots/perfect-dashboard')

const CHARTS = [
  { id: 'bc065fd02e6c', type: 'BigValue' },
  { id: '7a00fa2eb73f', type: 'LineChart' },
  { id: 'b07287084123', type: 'BarChart' },
  { id: 'f533a82a0fad', type: 'AreaChart' },
  { id: '832216849333', type: 'ScatterPlot' },
  { id: '21c09cf010a3', type: 'Histogram' },
  { id: 'ce8d6fbd5d12', type: 'StackedColumn' },
  { id: 'd0040a12bf90', type: 'GroupedColumn' },
  { id: '2fbd0e597ce0', type: 'PieChart' },
  { id: 'a77254f6d139', type: 'Treemap' },
  { id: '8398f10fea34', type: 'HeatMap' },
  { id: 'e7a53212ee33', type: 'BoxPlot' },
  { id: 'e84d443044fe', type: 'DotPlot' },
  { id: '901ac6c36603', type: 'RangePlot' },
  { id: 'a10fd22d0223', type: 'BulletBar' },
  { id: '1ca9e6916d15', type: 'ArrowPlot' },
  { id: 'b1d5a31030cb', type: 'SplitBars' },
  { id: '0a0ff1743c2f', type: 'ElectionDonut' },
  { id: '23d75330bfb6', type: 'MultiplePies' },
  { id: '4f60c7927f6a', type: 'SmallMultiples' },
  { id: '4ca80a40431d', type: 'ChoroplethMap' },
  { id: 'f85152d67b39', type: 'SymbolMap' },
  { id: 'f8f6b6fc5f6f', type: 'LocatorMap' },
  { id: '4eeecfb32330', type: 'SpikeMap' },
  { id: '11ae3e27f8b7', type: 'DataTable' },
]

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  // Full dashboard screenshot
  console.log('Taking full dashboard screenshot...')
  await page.goto(`http://localhost:3001/dashboard/${DASHBOARD_ID}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(OUT_DIR, '00-full-dashboard.png'), fullPage: true })
  console.log('  ✓ 00-full-dashboard.png')

  // Individual chart screenshots
  for (let i = 0; i < CHARTS.length; i++) {
    const chart = CHARTS[i]
    const num = String(i + 1).padStart(2, '0')
    const filename = `${num}-${chart.type}.png`

    await page.goto(`http://localhost:3001/chart/${chart.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Check for console errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.screenshot({ path: path.join(OUT_DIR, filename), fullPage: true })

    if (errors.length > 0) {
      console.log(`  ⚠ ${filename} (errors: ${errors.join('; ')})`)
    } else {
      console.log(`  ✓ ${filename}`)
    }
  }

  await browser.close()
  console.log(`\nDone! Screenshots saved to ${OUT_DIR}`)
}

main().catch(console.error)
