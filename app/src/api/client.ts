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
  const response = await apiFetch<LoginResponse>(`/auth/verify?token=${token}`)

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

// =============================================================================
// Conversation API
// =============================================================================

import type {
  MessageResponse,
  ConversationSession,
  ConversationListResponse,
  ProgressEvent,
  User,
  SidebarDashboardList,
  SchemaInfo,
  ChartListResponse,
  ChartLibraryItem,
  ProvidersResponse,
  SourceInfo,
} from '../types/conversation'

/**
 * Send a message to the dashboard conversation engine.
 */
export async function sendMessage(
  message: string,
  sessionId?: number
): Promise<MessageResponse> {
  return apiFetch('/conversation/message', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId }),
  })
}

// =============================================================================
// Chart Conversation API (for chart-first flow)
// =============================================================================

export interface ChartMessageResponse {
  response: string
  phase: string
  session_id: number
  title: string | null
  chart_id: string | null
  chart_url: string | null
  chart_title: string | null
  action_buttons: Array<{
    id: string
    label: string
    style: string
  }> | null
  error: string | null
  // Map to MessageResponse format for compatibility
  dashboard_created?: boolean
  dashboard_url?: string | null
  dashboard_slug?: string | null
}

/**
 * Send a message to the chart conversation engine.
 * Use this for chart creation (not dashboard creation).
 */
export async function sendChartMessage(
  message: string,
  sessionId?: number
): Promise<ChartMessageResponse> {
  return apiFetch('/charts/conversation/message', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId }),
  })
}

/**
 * Start a new chart conversation.
 */
export async function newChartConversation(): Promise<ChartMessageResponse> {
  return apiFetch('/charts/conversation/new', { method: 'POST' })
}

/**
 * Callbacks for streaming chart message response.
 */
export interface ChartStreamCallbacks {
  onProgress?: (event: ProgressEvent) => void
  onComplete?: (response: ChartMessageResponse) => void
  onError?: (error: string) => void
}

/**
 * Send a chart message with streaming progress updates via SSE.
 * Returns an abort function.
 */
export function sendChartMessageStream(
  message: string,
  sessionId: number | undefined,
  callbacks: ChartStreamCallbacks
): () => void {
  const token = getAuthToken()
  const abortController = new AbortController()

  const fetchStream = async () => {
    try {
      const response = await fetch(`${API_BASE}/charts/conversation/message/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, session_id: sessionId }),
        signal: abortController.signal,
      })

      if (response.status === 401) {
        localStorage.removeItem('token')
        window.location.href = '/login'
        return
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
        callbacks.onError?.(error.detail || `HTTP ${response.status}`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError?.('No response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)
          } else if (line === '' && eventType && eventData) {
            try {
              const data = JSON.parse(eventData)
              if (eventType === 'progress') {
                callbacks.onProgress?.(data as ProgressEvent)
              } else if (eventType === 'complete') {
                callbacks.onComplete?.(data as ChartMessageResponse)
              } else if (eventType === 'error') {
                callbacks.onError?.(data.error || 'Unknown error')
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e)
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        callbacks.onError?.((e as Error).message || 'Stream error')
      }
    }
  }

  fetchStream()
  return () => abortController.abort()
}

/**
 * Callbacks for streaming message response.
 */
export interface StreamCallbacks {
  onProgress?: (event: ProgressEvent) => void
  onComplete?: (response: MessageResponse) => void
  onError?: (error: string) => void
}

/**
 * Send a message with streaming progress updates via SSE.
 * Returns an abort function.
 */
export function sendMessageStream(
  message: string,
  sessionId: number | undefined,
  callbacks: StreamCallbacks
): () => void {
  const token = getAuthToken()
  const abortController = new AbortController()

  const fetchStream = async () => {
    try {
      const response = await fetch(`${API_BASE}/conversation/message/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, session_id: sessionId }),
        signal: abortController.signal,
      })

      if (response.status === 401) {
        localStorage.removeItem('token')
        window.location.href = '/login'
        return
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
        callbacks.onError?.(error.detail || `HTTP ${response.status}`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError?.('No response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)
          } else if (line === '' && eventType && eventData) {
            try {
              const data = JSON.parse(eventData)
              if (eventType === 'progress') {
                callbacks.onProgress?.(data as ProgressEvent)
              } else if (eventType === 'complete') {
                callbacks.onComplete?.(data as MessageResponse)
              } else if (eventType === 'error') {
                callbacks.onError?.(data.error || 'Unknown error')
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e)
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        callbacks.onError?.((e as Error).message || 'Stream error')
      }
    }
  }

  fetchStream()
  return () => abortController.abort()
}

/**
 * List all conversations.
 */
export async function listConversations(): Promise<ConversationListResponse> {
  return apiFetch('/conversation/list')
}

/**
 * Get a conversation by ID (or current if no ID).
 */
export async function getConversation(sessionId?: number): Promise<ConversationSession> {
  const url = sessionId ? `/conversation/${sessionId}` : '/conversation'
  return apiFetch(url)
}

/**
 * Start a new conversation.
 */
export async function newConversation(): Promise<ConversationSession> {
  return apiFetch('/conversation/new', { method: 'POST' })
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(sessionId: number): Promise<void> {
  await apiFetch(`/conversation/${sessionId}`, { method: 'DELETE' })
}

/**
 * Rename a conversation.
 */
export async function renameConversation(sessionId: number, title: string): Promise<void> {
  await apiFetch(`/conversation/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

// =============================================================================
// Dashboard API (for sidebar)
// =============================================================================

/**
 * Get list of dashboards.
 */
export async function getDashboards(): Promise<SidebarDashboardList> {
  return apiFetch('/dashboards')
}

// =============================================================================
// Schema API (for sidebar data explorer)
// =============================================================================

/**
 * Get schema info for a source.
 */
export async function getSourceSchema(sourceName: string): Promise<SchemaInfo> {
  return apiFetch(`/sources/${encodeURIComponent(sourceName)}/schema`)
}

// =============================================================================
// User API
// =============================================================================

/**
 * Get current user info (full).
 */
export async function getMe(): Promise<User> {
  return apiFetch('/auth/me')
}

// =============================================================================
// Chart Library API
// =============================================================================

export interface ChartSearchParams {
  query?: string
  chart_type?: string
}

/**
 * Get list of charts with optional search/filter.
 */
export async function getCharts(params?: ChartSearchParams): Promise<ChartListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.query) searchParams.set('query', params.query)
  if (params?.chart_type) searchParams.set('chart_type', params.chart_type)
  const queryString = searchParams.toString()
  return apiFetch(`/charts/library${queryString ? `?${queryString}` : ''}`)
}

/**
 * Get a single chart by ID.
 */
export async function getChart(chartId: string): Promise<ChartLibraryItem> {
  return apiFetch(`/charts/library/${chartId}`)
}

/**
 * Delete a chart from the library.
 */
export async function deleteChart(chartId: string): Promise<void> {
  await apiFetch(`/charts/library/${chartId}`, { method: 'DELETE' })
}

/**
 * Update a chart's title, description, and/or SQL.
 */
export async function updateChart(
  chartId: string,
  data: { title?: string; description?: string; sql?: string }
): Promise<{ success: boolean; chart?: ChartLibraryItem; error?: string }> {
  const response = await apiFetch<{ success: boolean; chart?: ChartLibraryItem; error?: string }>(
    `/charts/library/${chartId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  )
  return response
}

/**
 * Duplicate an existing chart.
 */
export async function duplicateChart(
  chartId: string
): Promise<{ chart: ChartLibraryItem; chart_url: string }> {
  const response = await apiFetch<{
    success: boolean
    chart: ChartLibraryItem
    chart_url: string
  }>(`/charts/library/${chartId}/duplicate`, { method: 'POST' })
  return { chart: response.chart, chart_url: response.chart_url }
}

/**
 * Get preview URL for a chart.
 */
export async function getChartPreviewUrl(chartId: string): Promise<string> {
  const response = await apiFetch<{ url: string }>(`/charts/library/${chartId}/preview-url`)
  return response.url
}

/**
 * Get the conversation session ID for a chart.
 */
export async function getChartSession(chartId: string): Promise<{ session_id: number; title: string | null }> {
  return apiFetch(`/charts/library/${chartId}/session`)
}

// =============================================================================
// Settings API
// =============================================================================

/**
 * Get available LLM providers.
 */
export async function getProviders(): Promise<ProvidersResponse> {
  return apiFetch('/providers')
}

/**
 * Update user's preferred provider.
 */
export async function updateProvider(provider: string): Promise<void> {
  await apiFetch('/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify({ preferred_provider: provider }),
  })
}

/**
 * Update user's business type.
 */
export async function updateBusinessType(businessType: string): Promise<void> {
  await apiFetch('/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify({ business_type: businessType }),
  })
}

/**
 * Update user's preferred source.
 */
export async function updateSource(source: string): Promise<void> {
  await apiFetch('/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify({ preferred_source: source }),
  })
}

/**
 * Get available data sources.
 */
export async function getSources(): Promise<SourceInfo[]> {
  return apiFetch('/sources')
}

// =============================================================================
// Dashboard Extended API
// =============================================================================

/**
 * Delete a dashboard by slug.
 */
export async function deleteDashboard(slug: string): Promise<void> {
  await apiFetch(`/dashboards/${slug}`, { method: 'DELETE' })
}

// =============================================================================
// Chart Templates API
// =============================================================================

export interface ChartTemplate {
  id: string
  name: string
  icon: string
  chart_type: string
  description: string
  prompt: string
  business_types: string[]
  category_id: string
  category_name: string
}

export interface ChartTemplatesResponse {
  templates: ChartTemplate[]
  total: number
}

/**
 * Get chart templates for the current user's business type.
 */
export async function getChartTemplates(): Promise<ChartTemplatesResponse> {
  return apiFetch('/templates/charts')
}

/**
 * Get all chart templates (across all business types).
 */
export async function getAllChartTemplates(): Promise<ChartTemplatesResponse> {
  return apiFetch('/templates/charts/all')
}

// =============================================================================
// Dashboard Composition API
// =============================================================================

export interface DashboardCreateRequest {
  title: string
  description: string | null
  chart_ids: string[]
}

export interface DashboardCreateResponse {
  success: boolean
  dashboard: {
    id: string
    slug: string
    title: string
    description: string | null
    chart_ids: string[]
    created_at: string
    updated_at: string
  } | null
  dashboard_url: string | null
  error: string | null
}

/**
 * Create a dashboard from selected charts.
 */
export async function createDashboardFromCharts(
  title: string,
  description: string | null,
  chartIds: string[]
): Promise<DashboardCreateResponse> {
  return apiFetch('/charts/dashboards', {
    method: 'POST',
    body: JSON.stringify({
      title,
      description,
      chart_ids: chartIds,
    }),
  })
}

/**
 * Generate a context block for a dashboard using AI.
 */
export async function generateDashboardContext(
  title: string,
  charts: Array<{ title: string; description: string }>
): Promise<{ context: string }> {
  return apiFetch('/charts/dashboards/generate-context', {
    method: 'POST',
    body: JSON.stringify({ title, charts }),
  })
}

/**
 * Update a dashboard's description/context.
 */
export async function updateDashboardDescription(
  dashboardId: string,
  description: string
): Promise<{ success: boolean }> {
  return apiFetch(`/charts/dashboards/${dashboardId}/description`, {
    method: 'PUT',
    body: JSON.stringify({ description }),
  })
}

// =============================================================================
// Chart Config Editor API
// =============================================================================

import type { ChartConfig } from '../types/chart'

export interface ConfigSuggestionResponse {
  suggested_config: Partial<ChartConfig>
  explanation: string
}

/**
 * Update a chart's visual configuration.
 * Only updates the specified config fields, leaving others unchanged.
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
 * Takes the current config and a natural language request.
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
// Semantic Layer API
// =============================================================================

export interface ColumnSemantic {
  name: string
  type: string
  nullable: boolean
  description: string | null
  role: string | null
  aggregation_hint: string | null
  business_meaning: string | null
  format_hint: string | null
  references: string | null
}

export interface TableSemantic {
  name: string
  description: string | null
  business_role: string | null
  columns: ColumnSemantic[]
  row_count: number | null
  typical_questions: string[] | null
}

export interface RelationshipSchema {
  from_table: string
  from_column: string
  to_table: string
  to_column: string
  type: string
  description: string | null
}

export interface BusinessContext {
  description: string | null
  domain: string | null
  key_metrics: string[] | null
  key_dimensions: string[] | null
  business_glossary: Record<string, string> | null
}

export interface SemanticLayerResponse {
  source_name: string
  has_semantic_layer: boolean
  tables: TableSemantic[]
  relationships: RelationshipSchema[]
  business_context: BusinessContext | null
  schema_hash: string | null
  generated_at: string | null
}

export interface SourceInfoExtended {
  name: string
  type: string
  connected: boolean
  database: string | null
  schema_name: string | null
  has_semantic_layer: boolean
  table_count: number | null
}

export interface SemanticUpdateRequest {
  table_name?: string
  column_name?: string
  updates: Record<string, unknown>
}

/**
 * Get list of data sources with semantic layer status.
 */
export async function fetchSourcesExtended(): Promise<SourceInfoExtended[]> {
  return apiFetch('/sources')
}

/**
 * Get semantic layer for a source.
 */
export async function fetchSemanticLayer(sourceName: string): Promise<SemanticLayerResponse> {
  return apiFetch(`/sources/${encodeURIComponent(sourceName)}/semantic`)
}

/**
 * Update semantic layer metadata.
 */
export async function updateSemanticLayer(
  sourceName: string,
  request: SemanticUpdateRequest
): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/sources/${encodeURIComponent(sourceName)}/semantic`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })
}

export interface SemanticGenerateRequest {
  provider?: string // claude, openai, gemini
  force?: boolean
}

export interface SemanticGenerateResponse {
  success: boolean
  message: string
  tables_count: number | null
  relationships_count: number | null
  domain: string | null
}

/**
 * Generate semantic layer using AI analysis.
 */
export async function generateSemanticLayer(
  sourceName: string,
  options?: SemanticGenerateRequest
): Promise<SemanticGenerateResponse> {
  return apiFetch(`/sources/${encodeURIComponent(sourceName)}/semantic/generate`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  })
}

// =============================================================================
// Semantic Layer Enhancement API
// =============================================================================

export interface SemanticEnhanceRequest {
  user_context: string // User's business context (any format)
  preview?: boolean // If true, return proposed changes without applying
}

export interface SemanticChange {
  path: string // e.g., "tables.CUSTOMERS.description"
  action: 'add' | 'update' | 'enhance'
  current_value: unknown | null
  new_value: unknown
}

export interface SemanticEnhanceSummary {
  metrics_added?: number
  terms_added?: number
  columns_enhanced?: number
  patterns_added?: number
  tables_enhanced?: string[]
}

export interface SemanticEnhanceResponse {
  success: boolean
  message: string
  changes: SemanticChange[] | null
  summary: SemanticEnhanceSummary | null
  applied: boolean
}

/**
 * Enhance semantic layer with user-provided business context.
 *
 * Accepts various formats: YAML, JSON, markdown, plain text, SQL with comments.
 * Set preview=true (default) to see proposed changes before applying.
 */
export async function enhanceSemanticLayer(
  sourceName: string,
  request: SemanticEnhanceRequest
): Promise<SemanticEnhanceResponse> {
  return apiFetch(`/sources/${encodeURIComponent(sourceName)}/semantic/enhance`, {
    method: 'POST',
    body: JSON.stringify(request),
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
