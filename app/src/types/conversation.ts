/**
 * Conversation types for future chat UI migration.
 * Placeholder for Phase 3.
 */

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ConversationState {
  sessionId: number | null
  messages: Message[]
  phase: string
  chartId?: string
  chartUrl?: string
  loading: boolean
  error?: string
}

export interface ActionButton {
  id: string
  label: string
  style: 'primary' | 'secondary' | 'danger'
}

export interface ConversationResponse {
  response: string
  phase: string
  sessionId: number
  title?: string
  chartId?: string
  chartUrl?: string
  chartTitle?: string
  actionButtons?: ActionButton[]
  error?: string
}
