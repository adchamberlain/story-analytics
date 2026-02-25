/**
 * Shared E2E test utilities.
 */
import { type Page, expect } from '@playwright/test'

const API_BASE = 'http://localhost:8000'

/** Create a test chart via the API and return its ID. */
export async function createTestChart(options?: {
  title?: string
  chartType?: string
  sourceId?: string
}): Promise<string> {
  const title = options?.title ?? 'E2E Test Chart'
  const chartType = options?.chartType ?? 'BarChart'

  // First, ensure we have a data source — upload a small CSV
  const csvData = 'category,value\nA,10\nB,20\nC,30\nD,15'
  const filename = `e2e-test-${Date.now()}.csv`
  const formData = new FormData()
  formData.append('file', new Blob([csvData], { type: 'text/csv' }), filename)

  const uploadRes = await fetch(`${API_BASE}/api/data/upload`, {
    method: 'POST',
    body: formData,
  })
  const uploadResult = await uploadRes.json()
  // Handle duplicate filename: use existing_source_id from error response
  const sourceId = options?.sourceId ?? uploadResult.source_id ?? uploadResult.detail?.existing_source_id

  // Create the chart
  const res = await fetch(`${API_BASE}/api/v2/charts/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: sourceId,
      chart_type: chartType,
      title,
      sql: 'SELECT category, value FROM data',
      x: 'category',
      y: 'value',
      config: {},
    }),
  })
  const result = await res.json()
  return result.id
}

/** Wait for a chart SVG or canvas to render inside the page. */
export async function waitForChart(page: Page, timeout = 10000): Promise<void> {
  // Wait for either an SVG plot or a chart container to be visible
  await page.waitForSelector('[class*="chart-container"] svg, [class*="sa-chart"] svg, figure svg', {
    timeout,
    state: 'visible',
  }).catch(() => {
    // Fallback: just wait for no network activity
    return page.waitForLoadState('networkidle', { timeout })
  })
}

/** Publish a chart so it's accessible via /embed/ and /public/ routes. */
export async function publishChart(chartId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v2/charts/${chartId}/publish`, {
    method: 'PUT',
  })
}

/** Delete a chart (cleanup after tests). */
export async function deleteChart(chartId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v2/charts/${chartId}`, {
    method: 'DELETE',
  })
}

/** Take a screenshot and save to tasks/screenshots/. */
export async function saveScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `../tasks/screenshots/${name}.png`,
    fullPage: true,
  })
}
