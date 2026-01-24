/**
 * API client for backend communication.
 * Handles authentication and request formatting.
 */

import type { ChartRenderData, FilterState } from '../types/chart'
import type { DashboardRenderData } from '../types/dashboard'

// Base URL for API requests (Vite proxy handles /api -> localhost:8000)
const API_BASE = '/api'

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('token')
}

// Create headers with auth token
function createHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      ...createHeaders(),
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
// Auth API (for future chat migration)
// =============================================================================

export interface LoginResponse {
  access_token: string
  token_type: string
}

/**
 * Request a magic link for email authentication.
 */
export async function requestMagicLink(email: string): Promise<{ message: string }> {
  return apiFetch('/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/**
 * Verify a magic link token.
 */
export async function verifyMagicLink(token: string): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>(`/auth/verify-magic-link?token=${token}`)

  // Store the token
  localStorage.setItem('token', response.access_token)

  return response
}

/**
 * Get current user info.
 */
export async function getCurrentUser(): Promise<{ email: string; id: number }> {
  return apiFetch('/auth/me')
}

/**
 * Logout (clear local token).
 */
export function logout(): void {
  localStorage.removeItem('token')
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken()
}
