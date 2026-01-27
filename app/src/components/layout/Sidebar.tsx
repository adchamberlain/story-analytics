/**
 * Sidebar component.
 * Navigation, conversation history, dashboard list, and data sources.
 */

import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConversationStore } from '../../stores/conversationStore'
import { useSourceStore } from '../../stores/sourceStore'
import { Logo } from '../brand'
import { SchemaBrowser, AddDataSourceWizard } from '../sources'
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
    loadConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
    logout,
    setCreationMode,
  } = useConversationStore()

  const [showConversations, setShowConversations] = useState(true)
  const [showDashboards, setShowDashboards] = useState(true)
  const [showDataSources, setShowDataSources] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showAddSourceWizard, setShowAddSourceWizard] = useState(false)

  // Source store
  const {
    sources,
    loadSources,
    openSchemaBrowser,
    schemaBrowserOpen,
  } = useSourceStore()

  // Load data on mount
  useEffect(() => {
    loadUser()
    loadConversationList()
    loadDashboards()
    loadSources()
  }, [loadUser, loadConversationList, loadDashboards, loadSources])

  // Handle conversation switch
  const handleSwitchConversation = async (conv: ConversationSummary) => {
    if (conv.conversation_type === 'chart') {
      // For chart conversations, load conversation and set chart mode
      setCreationMode('chart')
      await loadConversation(conv.id)
      // Navigate to chat page without URL params (avoids race condition)
      if (location.pathname !== '/chat') {
        navigate('/chat')
      }
    } else {
      // For dashboard conversations, load directly without URL params
      setCreationMode('dashboard')
      await loadConversation(conv.id)
      if (location.pathname !== '/chat') {
        navigate('/chat')
      }
    }
  }

  // Handle delete - show inline confirmation
  const handleDeleteClick = (e: React.MouseEvent, convId: number) => {
    e.stopPropagation()
    setDeletingId(convId)
  }

  const handleDeleteConfirm = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation()
    await deleteConversation(convId)
    setDeletingId(null)
    // Navigate to fresh chat page
    navigate('/chat?new=1')
  }

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(null)
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
        backgroundColor: 'var(--color-gray-900)',
        borderRight: '1px solid var(--color-gray-700)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Logo with dual cursors */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--color-gray-700)',
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
                  // Chat always starts a new conversation
                  if (item.path === '/chat') {
                    navigate('/chat?new=1')
                  } else {
                    navigate(item.path)
                  }
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
                      ? 'var(--color-gray-800)'
                      : 'transparent',
                  color:
                    location.pathname === item.path
                      ? 'var(--color-primary)'
                      : 'var(--color-gray-300)',
                }}
              >
                <span style={{ color: 'var(--color-warning)', fontFamily: 'var(--font-brand)' }}>
                  {item.icon}
                </span>
                <span style={{ fontFamily: 'var(--font-brand)' }}>{item.label}</span>
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
              <span style={{ fontFamily: 'var(--font-brand)' }}>Conversations</span>
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
              {/* Only show conversations that have been titled (after first message) */}
              {conversationList.filter(c => c.title).length === 0 ? (
                <li
                  style={{
                    color: 'var(--color-gray-400)',
                    fontSize: 'var(--text-xs)',
                    padding: 'var(--space-1) 0',
                    fontFamily: 'var(--font-brand)',
                  }}
                >
                  No conversations yet
                </li>
              ) : (
                conversationList.filter(c => c.title).map((conv) => (
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
                          backgroundColor: 'var(--color-gray-800)',
                          color: 'var(--color-gray-200)',
                          border: '1px solid var(--color-primary)',
                          borderRadius: 'var(--radius-sm)',
                          outline: 'none',
                        }}
                      />
                    ) : deletingId === conv.id ? (
                      /* Inline delete confirmation */
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          flex: 1,
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-gray-500)',
                          padding: 'var(--space-1) 0',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-brand)' }}>Delete?</span>
                        <button
                          onClick={(e) => handleDeleteConfirm(e, conv.id)}
                          style={{
                            color: 'var(--color-error)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={handleDeleteCancel}
                          style={{
                            color: 'var(--color-gray-500)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 'var(--text-xs)',
                          }}
                        >
                          No
                        </button>
                      </div>
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
                              fontFamily: 'var(--font-brand)',
                            }}
                          >
                            {conv.title}
                          </span>
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, conv.id)}
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
            <span style={{ fontFamily: 'var(--font-brand)' }}>Recent Dashboards</span>
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

        {/* Data Sources */}
        <div style={{ marginTop: 'var(--space-6)' }}>
          <button
            onClick={() => setShowDataSources(!showDataSources)}
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
                transform: showDataSources ? 'rotate(90deg)' : 'none',
                transition: 'transform var(--transition-fast)',
              }}
            >
              {'>'}
            </span>
            <span style={{ fontFamily: 'var(--font-brand)' }}>Data Sources</span>
          </button>

          {showDataSources && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                marginLeft: 'var(--space-4)',
              }}
            >
              {sources.map((source) => {
                const isActive = user?.preferred_source === source.name
                return (
                  <li key={source.name}>
                    <button
                      onClick={() => openSchemaBrowser(source.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        width: '100%',
                        textAlign: 'left',
                        fontSize: 'var(--text-sm)',
                        color: isActive ? 'var(--color-primary)' : 'var(--color-gray-400)',
                        padding: 'var(--space-1) 0',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title={`${source.name}${isActive ? ' (active)' : ''} - Click to browse schema`}
                    >
                      <span
                        style={{
                          color: isActive
                            ? 'var(--color-primary)'
                            : source.connected
                              ? 'var(--color-success)'
                              : 'var(--color-gray-600)',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {isActive ? '\u2713' : source.connected ? '\u25CF' : '\u25CB'}
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-brand)',
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {source.name}
                      </span>
                      {source.table_count !== null && source.table_count > 0 && (
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-gray-500)',
                            flexShrink: 0,
                          }}
                        >
                          {source.table_count} tables
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
              {/* Add Data Source button */}
              <li style={{ marginTop: 'var(--space-2)' }}>
                <button
                  onClick={() => setShowAddSourceWizard(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    width: '100%',
                    textAlign: 'left',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-primary)',
                    padding: 'var(--space-1) 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)' }}>+</span>
                  <span style={{ fontFamily: 'var(--font-brand)' }}>Add Data Source</span>
                </button>
              </li>
            </ul>
          )}
        </div>
      </nav>

      {/* User info */}
      {user && (
        <div
          style={{
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--color-gray-700)',
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
                  color: 'var(--color-gray-300)',
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
                color: 'var(--color-gray-500)',
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

      {/* Schema Browser Modal */}
      {schemaBrowserOpen && <SchemaBrowser />}

      {/* Add Data Source Wizard Modal */}
      <AddDataSourceWizard
        isOpen={showAddSourceWizard}
        onClose={() => setShowAddSourceWizard(false)}
      />

    </aside>
  )
}
