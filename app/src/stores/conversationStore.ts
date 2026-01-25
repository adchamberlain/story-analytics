/**
 * Conversation state management using Zustand.
 * Manages chat messages, session state, and streaming progress.
 */

import { create } from 'zustand'
import type {
  ExtendedMessage,
  ConversationSummary,
  ProgressStep,
  LastDashboardInfo,
  User,
  SidebarDashboard,
} from '../types/conversation'
import {
  sendMessage as apiSendMessage,
  sendChartMessage as apiSendChartMessage,
  sendMessageStream,
  listConversations,
  getConversation,
  newConversation,
  deleteConversation as apiDeleteConversation,
  renameConversation as apiRenameConversation,
  getMe,
  getDashboards,
  logout as apiLogout,
} from '../api/client'

// Human-readable step labels
const STEP_LABELS: Record<string, string> = {
  requirements: 'Analyzing request',
  feasibility: 'Checking data availability',
  sql: 'Generating SQL',
  layout: 'Building layout',
  validation: 'Validating',
  writing: 'Creating file',
  qa: 'Quality check',
  complete: 'Complete',
}

interface ConversationState {
  // Session state
  currentSessionId: number | null
  currentTitle: string | null
  messages: ExtendedMessage[]
  phase: string
  loading: boolean
  conversationComplete: boolean

  // Creation mode: 'chart' or 'dashboard' (determines which API to use)
  creationMode: 'chart' | 'dashboard' | null

  // Last created dashboard/chart
  lastDashboard: LastDashboardInfo | null
  lastChartId: string | null
  lastChartUrl: string | null

  // Conversation list (sidebar)
  conversationList: ConversationSummary[]

  // Dashboard list (sidebar)
  dashboardList: SidebarDashboard[]

  // Streaming progress
  progressSteps: ProgressStep[]
  isStreaming: boolean

  // User state
  user: User | null

  // Actions
  loadConversation: (sessionId?: number) => Promise<void>
  loadConversationList: () => Promise<void>
  switchConversation: (sessionId: number) => Promise<void>
  startNewConversation: () => Promise<void>
  setCreationMode: (mode: 'chart' | 'dashboard' | null) => void
  sendMessage: (content: string) => Promise<string>
  deleteConversation: (sessionId: number) => Promise<void>
  renameConversation: (sessionId: number, title: string) => Promise<void>
  loadDashboards: () => Promise<void>
  loadUser: () => Promise<void>
  logout: () => void
  getStepLabel: (step: string) => string
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  // Initial state
  currentSessionId: null,
  currentTitle: null,
  messages: [],
  phase: 'intent',
  loading: false,
  conversationComplete: false,
  creationMode: null,
  lastDashboard: null,
  lastChartId: null,
  lastChartUrl: null,
  conversationList: [],
  dashboardList: [],
  progressSteps: [],
  isStreaming: false,
  user: null,

  // Get human-readable step label
  getStepLabel: (step: string) => STEP_LABELS[step] || step,

  // Set creation mode (chart vs dashboard)
  setCreationMode: (mode: 'chart' | 'dashboard' | null) => {
    set({ creationMode: mode })
  },

  // Load user info
  loadUser: async () => {
    try {
      const user = await getMe()
      set({ user })
    } catch {
      set({ user: null })
    }
  },

  // Logout
  logout: () => {
    apiLogout()
    set({
      user: null,
      currentSessionId: null,
      currentTitle: null,
      messages: [],
      phase: 'intent',
      conversationList: [],
    })
    window.location.href = '/login'
  },

  // Load dashboard list
  loadDashboards: async () => {
    try {
      const response = await getDashboards()
      set({ dashboardList: response.dashboards })
    } catch (error) {
      console.error('Failed to load dashboards:', error)
      set({ dashboardList: [] })
    }
  },

  // Load conversation list
  loadConversationList: async () => {
    try {
      const response = await listConversations()
      set({ conversationList: response.conversations })
    } catch (error) {
      console.error('Failed to load conversation list:', error)
      set({ conversationList: [] })
    }
  },

  // Load a conversation (current or by ID)
  loadConversation: async (sessionId?: number) => {
    try {
      const session = await getConversation(sessionId)
      set({
        currentSessionId: session.id,
        currentTitle: session.title,
        messages: session.messages as ExtendedMessage[],
        phase: session.phase,
        lastDashboard: null,
        conversationComplete: false,
      })
    } catch (error) {
      console.error('Failed to load conversation:', error)
      set({
        messages: [],
        phase: 'intent',
        currentSessionId: null,
        currentTitle: null,
        conversationComplete: false,
      })
    }
  },

  // Switch to a different conversation
  switchConversation: async (sessionId: number) => {
    await get().loadConversation(sessionId)
  },

  // Start a new conversation
  startNewConversation: async () => {
    try {
      const session = await newConversation()
      set({
        currentSessionId: session.id,
        currentTitle: session.title,
        messages: [],
        phase: 'intent',
        lastDashboard: null,
        conversationComplete: false,
      })
      await get().loadConversationList()
    } catch (error) {
      console.error('Failed to start new conversation:', error)
    }
  },

  // Delete a conversation
  deleteConversation: async (sessionId: number) => {
    try {
      await apiDeleteConversation(sessionId)
      const { currentSessionId } = get()
      if (currentSessionId === sessionId) {
        await get().startNewConversation()
      } else {
        await get().loadConversationList()
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      throw error
    }
  },

  // Rename a conversation
  renameConversation: async (sessionId: number, title: string) => {
    try {
      await apiRenameConversation(sessionId, title)
      const { currentSessionId } = get()
      if (currentSessionId === sessionId) {
        set({ currentTitle: title })
      }
      await get().loadConversationList()
    } catch (error) {
      console.error('Failed to rename conversation:', error)
      throw error
    }
  },

  // Send a message
  sendMessage: async (content: string) => {
    const { currentSessionId, creationMode } = get()
    const isAction = content.startsWith('__action:')
    const useStreaming = shouldUseStreaming(content)

    set({ loading: true, lastDashboard: null, lastChartId: null, lastChartUrl: null })

    if (useStreaming) {
      set({ progressSteps: [], isStreaming: true })
    }

    // Add user message immediately (unless it's an action)
    if (!isAction) {
      set((state) => ({
        messages: [...state.messages, { role: 'user', content }],
      }))
    }

    // Use chart API when in chart mode
    if (creationMode === 'chart') {
      try {
        const response = await apiSendChartMessage(content, currentSessionId ?? undefined)

        // Map chart response to conversation format
        set((state) => ({
          currentSessionId: response.session_id,
          currentTitle: response.title || state.currentTitle,
          messages: [
            ...state.messages,
            {
              role: 'assistant' as const,
              content: response.response,
              action_buttons: response.action_buttons?.map(btn => ({
                id: btn.id,
                label: btn.label,
                style: btn.style as 'primary' | 'secondary',
              })),
              // Map chart_url to dashboard_url for Message component compatibility
              dashboard_url: response.chart_url,
              dashboard_slug: response.chart_id,
            },
          ],
          phase: response.phase,
          lastChartId: response.chart_id,
          lastChartUrl: response.chart_url,
          conversationComplete: checkChartConversationComplete(response.action_buttons),
          loading: false,
        }))

        await get().loadConversationList()
        return response.response
      } catch (error) {
        set({ loading: false })
        throw error
      }
    }

    // Dashboard mode (existing flow)
    if (useStreaming) {
      // Use streaming endpoint
      return new Promise<string>((resolve, reject) => {
        sendMessageStream(content, currentSessionId ?? undefined, {
          onProgress: (event) => {
            set((state) => {
              const existingIndex = state.progressSteps.findIndex(
                (s) => s.step === event.step
              )
              const newStep: ProgressStep = {
                step: event.step,
                status: event.status,
                message: event.message,
                details: event.details,
              }

              if (existingIndex >= 0) {
                const updated = [...state.progressSteps]
                updated[existingIndex] = newStep
                return { progressSteps: updated }
              }
              return { progressSteps: [...state.progressSteps, newStep] }
            })
          },
          onComplete: async (response) => {
            set((state) => ({
              isStreaming: false,
              currentSessionId: response.session_id,
              currentTitle: response.title || state.currentTitle,
              messages: [
                ...state.messages,
                {
                  role: 'assistant',
                  content: response.response,
                  clarifying_options: response.clarifying_options,
                  action_buttons: response.action_buttons,
                  qa_result: response.qa_result,
                  error_context: response.error_context,
                  dashboard_url: response.dashboard_created ? response.dashboard_url : null,
                  dashboard_slug: response.dashboard_created ? response.dashboard_slug : null,
                },
              ],
              phase: response.phase,
              lastDashboard:
                response.dashboard_created && response.dashboard_url
                  ? {
                      url: response.dashboard_url,
                      slug: response.dashboard_slug,
                      created: true,
                      qa_result: response.qa_result,
                    }
                  : state.lastDashboard,
              conversationComplete: checkConversationComplete(response.action_buttons),
              loading: false,
            }))

            // Clear progress after delay
            setTimeout(() => set({ progressSteps: [] }), 2000)

            await get().loadConversationList()
            if (response.dashboard_created) {
              await get().loadDashboards()
            }
            resolve(response.response)
          },
          onError: (error) => {
            set({ isStreaming: false, progressSteps: [], loading: false })
            reject(new Error(error))
          },
        })
      })
    } else {
      // Use regular endpoint
      try {
        const response = await apiSendMessage(content, currentSessionId ?? undefined)

        set((state) => ({
          currentSessionId: response.session_id,
          currentTitle: response.title || state.currentTitle,
          messages: [
            ...state.messages,
            {
              role: 'assistant',
              content: response.response,
              clarifying_options: response.clarifying_options,
              action_buttons: response.action_buttons,
              qa_result: response.qa_result,
              error_context: response.error_context,
              dashboard_url: response.dashboard_created ? response.dashboard_url : null,
              dashboard_slug: response.dashboard_created ? response.dashboard_slug : null,
            },
          ],
          phase: response.phase,
          lastDashboard:
            response.dashboard_created && response.dashboard_url
              ? {
                  url: response.dashboard_url,
                  slug: response.dashboard_slug,
                  created: true,
                  qa_result: response.qa_result,
                }
              : state.lastDashboard,
          conversationComplete: checkConversationComplete(response.action_buttons),
          loading: false,
        }))

        await get().loadConversationList()
        if (response.dashboard_created) {
          await get().loadDashboards()
        }
        return response.response
      } catch (error) {
        set({ loading: false })
        throw error
      }
    }
  },
}))

// Helper: Check if streaming should be used
function shouldUseStreaming(content: string): boolean {
  if (!content.startsWith('__action:')) return false
  const action = content.slice(9).toLowerCase()
  return ['generate', 'generate_now', 'retry'].includes(action)
}

// Helper: Check if dashboard conversation is complete
function checkConversationComplete(
  actionButtons: Array<{ id: string }> | null | undefined
): boolean {
  if (!actionButtons) return false
  return actionButtons.some((btn) => btn.id.startsWith('view_dashboard:'))
}

// Helper: Check if chart conversation is complete
function checkChartConversationComplete(
  actionButtons: Array<{ id: string }> | null | undefined
): boolean {
  if (!actionButtons) return false
  // Chart is complete when user sees Done button (after chart is created)
  return actionButtons.some((btn) => btn.id === 'done')
}
