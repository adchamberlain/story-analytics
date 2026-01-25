/**
 * Conversation types for chat UI.
 * Ported from frontend/src/lib/types.ts
 */

// =============================================================================
// User & Auth Types
// =============================================================================

export type BusinessType = 'saas' | 'ecommerce' | 'general'

export interface User {
  id: number
  email: string
  name: string
  preferred_provider: string
  preferred_source: string
  business_type: BusinessType
  created_at: string
}

// =============================================================================
// Message Types
// =============================================================================

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ClarifyingOption {
  label: string
  value: string
}

export interface ActionButton {
  id: string
  label: string
  style: 'primary' | 'secondary'
}

export interface QAResult {
  passed: boolean
  summary: string
  critical_issues: string[]
  suggestions: string[]
  screenshot_url: string | null
  auto_fixed: boolean
  issues_fixed: string[]
}

export interface ExtendedMessage extends Message {
  clarifying_options?: ClarifyingOption[] | null
  action_buttons?: ActionButton[] | null
  qa_result?: QAResult | null
  error_context?: string | null
  dashboard_url?: string | null
  dashboard_slug?: string | null
}

// =============================================================================
// Conversation Types
// =============================================================================

export interface ConversationSession {
  id: number
  title: string | null
  messages: Message[]
  phase: string
  intent: string | null
  target_dashboard: string | null
  created_at: string
  updated_at: string
}

export interface ConversationSummary {
  id: number
  title: string | null
  phase: string
  message_count: number
  conversation_type: 'dashboard' | 'chart'
  chart_id: string | null
  created_at: string
  updated_at: string
}

export interface ConversationListResponse {
  conversations: ConversationSummary[]
}

// =============================================================================
// API Response Types
// =============================================================================

export interface MessageResponse {
  response: string
  phase: string
  session_id: number
  title: string | null
  dashboard_url: string | null
  dashboard_slug: string | null
  dashboard_created: boolean
  clarifying_options: ClarifyingOption[] | null
  action_buttons: ActionButton[] | null
  qa_result: QAResult | null
  error_context: string | null
}

export interface ProgressEvent {
  step: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  message: string
  details?: string
}

// =============================================================================
// Dashboard Types (for sidebar)
// =============================================================================

export interface SidebarDashboard {
  id: number
  slug: string
  title: string
  file_path: string
  url: string
  created_at: string
  updated_at: string
}

export interface SidebarDashboardList {
  dashboards: SidebarDashboard[]
  total: number
}

// =============================================================================
// Schema Types (for sidebar data explorer)
// =============================================================================

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
}

export interface SchemaInfo {
  source: string
  database: string
  schema: string
  tables: TableInfo[]
}

// =============================================================================
// Progress Step (for streaming UI)
// =============================================================================

export interface ProgressStep {
  step: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  message: string
  details?: string
}

// =============================================================================
// Last Dashboard Info (for post-creation state)
// =============================================================================

export interface LastDashboardInfo {
  url: string
  slug: string | null
  created: boolean
  qa_result: QAResult | null
}

// =============================================================================
// Chart Library Types (API response format - snake_case)
// =============================================================================

export interface ChartLibraryConfig {
  x: string | null
  y: string | string[] | null
  value: string | null
  series: string | null
  title: string | null
  extra_props: Record<string, unknown> | null
}

export interface ChartLibraryItem {
  id: string
  title: string
  description: string
  query_name: string
  sql: string
  chart_type: string
  config: ChartLibraryConfig
  created_at: string
  updated_at: string
  original_request: string
  is_valid: boolean
}

export interface ChartListResponse {
  charts: ChartLibraryItem[]
  total: number
}

// =============================================================================
// Provider & Settings Types
// =============================================================================

export interface Provider {
  id: string
  name: string
  models: string[]
}

export interface ProvidersResponse {
  providers: Provider[]
}

export interface SourceInfo {
  name: string
  type: string
  connected: boolean
  database: string | null
  schema_name: string | null
}
