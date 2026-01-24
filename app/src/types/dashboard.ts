/**
 * Dashboard types mirroring engine/models/chart.py Dashboard classes
 */

import type { ChartRenderData } from './chart'

// =============================================================================
// Layout Types
// =============================================================================

export interface DashboardLayoutSection {
  title?: string
  chartIds: string[]
}

export interface DashboardLayout {
  sections: DashboardLayoutSection[]
}

// =============================================================================
// Dashboard Entity
// =============================================================================

export interface Dashboard {
  id: string
  slug: string
  title: string
  description?: string
  chartIds: string[]
  layout: DashboardLayout
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Render Data (what API returns)
// =============================================================================

export interface DashboardRenderData {
  /** Dashboard metadata */
  dashboard: Dashboard

  /** Chart render data for each chart in the dashboard */
  charts: ChartRenderData[]
}
