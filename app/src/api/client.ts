/**
 * API client for backend communication.
 */

import type { ChartConfig } from '../types/chart'
import { authFetch } from '../utils/authFetch'

// Base URL for API requests (Vite proxy handles /api -> localhost:8000)
const API_BASE = '/api'

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`

  const response = await authFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  return response.json()
}

// =============================================================================
// Render API
// =============================================================================

import type { ChartRenderData, FilterState } from '../types/chart'
import type { DashboardRenderData } from '../types/dashboard'

/**
 * Fetch render data for a chart by ID.
 */
export async function fetchChartRenderData(chartId: string): Promise<ChartRenderData> {
  return apiFetch<ChartRenderData>(`/render/chart/${chartId}`)
}

/**
 * Fetch render data for a chart by slug (for single-chart pages).
 */
export async function fetchChartRenderDataBySlug(slug: string): Promise<ChartRenderData> {
  return apiFetch<ChartRenderData>(`/render/chart-by-slug/${slug}`)
}

/**
 * Fetch render data for a dashboard by slug.
 */
export async function fetchDashboardRenderData(slug: string): Promise<DashboardRenderData> {
  return apiFetch<DashboardRenderData>(`/render/dashboard/${slug}`)
}

/**
 * Execute a SQL query with filter values.
 */
export async function executeQuery(
  sql: string,
  filters?: FilterState
): Promise<{ data: Record<string, unknown>[]; columns: string[] }> {
  return apiFetch('/render/execute-query', {
    method: 'POST',
    body: JSON.stringify({ sql, filters }),
  })
}

// =============================================================================
// Chart Config Editor API
// =============================================================================

export interface ChartLibraryItem {
  id: string
  chart_type: string
  title: string | null
  subtitle: string | null
  source: string | null
  x: string | null
  y: string | null
  series: string | null
  horizontal: boolean
  sort: boolean
  config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ConfigSuggestionResponse {
  suggested_config: Partial<ChartConfig>
  explanation: string
}

/**
 * Update a chart's visual configuration.
 */
export async function updateChartConfig(
  chartId: string,
  config: Partial<ChartConfig>
): Promise<{ success: boolean; chart?: ChartLibraryItem; error?: string }> {
  return apiFetch(`/charts/library/${chartId}/config`, {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  })
}

/**
 * Get an AI-powered suggestion for config changes.
 */
export async function getConfigSuggestion(
  chartId: string,
  currentConfig: Partial<ChartConfig>,
  chartType: string,
  userRequest: string
): Promise<ConfigSuggestionResponse> {
  return apiFetch(`/charts/library/${chartId}/suggest-config`, {
    method: 'POST',
    body: JSON.stringify({
      current_config: currentConfig,
      chart_type: chartType,
      user_request: userRequest,
    }),
  })
}

// =============================================================================
// Data Source Connection API
// =============================================================================

export interface SnowflakeConnectionRequest {
  account: string
  username: string
  password: string
  warehouse: string
  database: string
  schema_name: string
}

export interface ConnectionTestResponse {
  success: boolean
  message: string
  tables: string[] | null
}

/**
 * Test a Snowflake connection.
 */
export async function testSnowflakeConnection(
  connection: SnowflakeConnectionRequest
): Promise<ConnectionTestResponse> {
  return apiFetch('/sources/snowflake/test', {
    method: 'POST',
    body: JSON.stringify(connection),
  })
}

/**
 * Save a Snowflake connection.
 */
export async function saveSnowflakeConnection(
  connection: SnowflakeConnectionRequest,
  sourceName: string
): Promise<{ message: string }> {
  return apiFetch(`/sources/snowflake/save?source_name=${encodeURIComponent(sourceName)}`, {
    method: 'POST',
    body: JSON.stringify(connection),
  })
}
