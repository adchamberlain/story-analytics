/**
 * Sidebar component.
 * Navigation, conversation history, and dashboard list.
 */

import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConversationStore } from '../../stores/conversationStore'
import { Logo } from '../brand'
import type { ConversationSummary } from '../../types/conversation'

// Navigation items
const NAV_ITEMS = [
  { path: '/chat', label: 'Chat', icon: '>' },
  { path: '/charts', label: 'Charts', icon: '~' },
  { path: '/dashboards', label: 'Dashboards', icon: '#' },
  { path: '/settings', label: 'Settings', icon: '*' },
]

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    conversationList,
    dashboardList,
    currentSessionId,
    user,
    loadConversationList,
    loadDashboards,
    loadUser,
    switchConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
    logout,
  } = useConversationStore()

  const [showConversations, setShowConversations] = useState(true)
  const [showDashboards, setShowDashboards] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Load data on mount
  useEffect(() => {
    loadUser()
    loadConversationList()
    loadDashboards()
  }, [loadUser, loadConversationList, loadDashboards])

  // Handle conversation switch
  const handleSwitchConversation = async (conv: ConversationSummary) => {
    if (conv.conversation_type === 'chart') {
      // For chart conversations, navigate to chart page
      navigate('/charts/new')
    } else {
      await switchConversation(conv.id)
      navigate('/chat')
    }
  }

  // Handle delete
  const handleDelete = async (e: React.MouseEvent, conv: ConversationSummary) => {
    e.stopPropagation()
    if (confirm('Delete this conversation?')) {
      await deleteConversation(conv.id)
    }
  }

  // Handle rename
  const startEditing = (e: React.MouseEvent, id: number, title: string | null) => {
    e.stopPropagation()
    setEditingId(id)
    setEditingTitle(title || '')
  }

  const saveEdit = async (id: number) => {
    if (editingTitle.trim()) {
      await renameConversation(id, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      saveEdit(id)
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  return (
    <aside
      style={{
        width: '256px',
        height: '100%',
        backgroundColor: 'var(--color-gray-50)',
        borderRight: '1px solid var(--color-gray-200)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Logo with dual cursors */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--color-gray-200)',
        }}
      >
        <Logo size="md" showTagline={true} />
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: 'var(--space-4)', overflowY: 'auto' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {NAV_ITEMS.map((item) => (
            <li key={item.path} style={{ marginBottom: 'var(--space-1)' }}>
              <a
                href={item.path}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(item.path)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  transition: 'all var(--transition-fast)',
                  backgroundColor:
                    location.pathname === item.path
                      ? 'var(--color-gray-200)'
                      : 'transparent',
                  color:
                    location.pathname === item.path
                      ? 'var(--color-primary)'
                      : 'var(--color-gray-700)',
                }}
              >
                <span style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            </li>
          ))}
        </ul>

        {/* Conversations */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-2)',
            }}
          >
            <button
              onClick={() => setShowConversations(!showConversations)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                color: 'var(--color-gray-500)',
                fontSize: 'var(--text-sm)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  transform: showConversations ? 'rotate(90deg)' : 'none',
                  transition: 'transform var(--transition-fast)',
                }}
              >
                {'>'}
              </span>
              <span>Conversations</span>
            </button>
            <button
              onClick={startNewConversation}
              style={{
                color: 'var(--color-primary)',
                fontSize: 'var(--text-sm)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              title="New conversation"
            >
              +
            </button>
          </div>

          {showConversations && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                marginLeft: 'var(--space-4)',
                maxHeight: '192px',
                overflowY: 'auto',
              }}
            >
              {conversationList.length === 0 ? (
                <li
                  style={{
                    color: 'var(--color-gray-400)',
                    fontSize: 'var(--text-xs)',
                    padding: 'var(--space-1) 0',
                  }}
                >
                  No conversations yet
                </li>
              ) : (
                conversationList.map((conv) => (
                  <li
                    key={conv.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    {editingId === conv.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => handleEditKeyDown(e, conv.id)}
                        onBlur={() => saveEdit(conv.id)}
                        autoFocus
                        style={{
                          fontSize: 'var(--text-sm)',
                          padding: '2px 4px',
                          flex: 1,
                          backgroundColor: 'white',
                          border: '1px solid var(--color-primary)',
                          borderRadius: 'var(--radius-sm)',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => handleSwitchConversation(conv)}
                          onDoubleClick={(e) => startEditing(e, conv.id, conv.title)}
                          style={{
                            flex: 1,
                            textAlign: 'left',
                            fontSize: 'var(--text-sm)',
                            padding: 'var(--space-1) 0',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color:
                              currentSessionId === conv.id
                                ? 'var(--color-primary)'
                                : 'var(--color-gray-500)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-1)',
                            overflow: 'hidden',
                          }}
                          title="Double-click to rename"
                        >
                          <span
                            style={{
                              color:
                                conv.conversation_type === 'chart'
                                  ? 'var(--color-warning)'
                                  : 'var(--color-gray-400)',
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            {conv.conversation_type === 'chart' ? '~' : '#'}
                          </span>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {conv.title || 'New conversation'}
                          </span>
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, conv)}
                          style={{
                            color: 'var(--color-gray-400)',
                            fontSize: 'var(--text-xs)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: 0,
                            transition: 'opacity var(--transition-fast)',
                            padding: '0 var(--space-1)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1'
                            e.currentTarget.style.color = 'var(--color-error)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0'
                            e.currentTarget.style.color = 'var(--color-gray-400)'
                          }}
                          title="Delete conversation"
                        >
                          x
                        </button>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* Dashboards */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <button
            onClick={() => setShowDashboards(!showDashboards)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--text-sm)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
              marginBottom: 'var(--space-2)',
            }}
          >
            <span
              style={{
                transform: showDashboards ? 'rotate(90deg)' : 'none',
                transition: 'transform var(--transition-fast)',
              }}
            >
              {'>'}
            </span>
            <span>Recent Dashboards</span>
          </button>

          {showDashboards && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                marginLeft: 'var(--space-4)',
              }}
            >
              {dashboardList.length === 0 ? (
                <li
                  style={{
                    color: 'var(--color-gray-400)',
                    fontSize: 'var(--text-xs)',
                    padding: 'var(--space-1) 0',
                  }}
                >
                  No dashboards yet
                </li>
              ) : (
                dashboardList.slice(0, 5).map((dashboard) => (
                  <li key={dashboard.id}>
                    <a
                      href={dashboard.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-gray-500)',
                        padding: 'var(--space-1) 0',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={dashboard.title}
                    >
                      {dashboard.title}
                    </a>
                  </li>
                ))
              )}
              {dashboardList.length > 5 && (
                <li>
                  <a
                    href="/dashboards"
                    onClick={(e) => {
                      e.preventDefault()
                      navigate('/dashboards')
                    }}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-warning)',
                      textDecoration: 'none',
                    }}
                  >
                    View all ({dashboardList.length})
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>
      </nav>

      {/* User info */}
      {user && (
        <div
          style={{
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--color-gray-200)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-gray-700)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.name}
              </p>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-gray-500)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email}
              </p>
            </div>
            <button
              onClick={logout}
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-gray-400)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Log out
            </button>
          </div>
        </div>
      )}

    </aside>
  )
}
