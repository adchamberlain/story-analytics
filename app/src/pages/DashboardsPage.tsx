/**
 * Dashboards list page.
 * View and manage created dashboards.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConversationStore } from '../stores/conversationStore'
import { deleteDashboard } from '../api/client'

export function DashboardsPage() {
  const navigate = useNavigate()
  const { dashboardList, loadDashboards } = useConversationStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load dashboards on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await loadDashboards()
      setLoading(false)
    }
    load()
  }, [loadDashboards])

  // Filter dashboards by search
  const filteredDashboards = searchQuery
    ? dashboardList.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.slug.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : dashboardList

  const handleDelete = async (slug: string) => {
    if (deleteConfirm !== slug) {
      setDeleteConfirm(slug)
      return
    }
    try {
      await deleteDashboard(slug)
      await loadDashboards()
      setDeleteConfirm(null)
    } catch {
      alert('Failed to delete dashboard')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--color-gray-900)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--color-gray-700)',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-lg)',
            fontWeight: 700,
            color: 'var(--color-primary)',
          }}
        >
          Dashboards
        </h1>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search dashboards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--color-gray-800)',
              border: '1px solid var(--color-gray-700)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-gray-200)',
              fontSize: 'var(--text-sm)',
              width: '250px',
            }}
          />

          {/* New Dashboard */}
          <button
            onClick={() => navigate('/chat')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              backgroundColor: 'var(--color-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + New Dashboard
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-6)',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-gray-400)',
            }}
          >
            Loading dashboards...
          </div>
        ) : dashboardList.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-gray-400)',
            }}
          >
            <span style={{ fontSize: 'var(--text-lg)' }}>No dashboards yet.</span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-gray-500)',
                marginTop: 'var(--space-2)',
              }}
            >
              Create your first dashboard to see it here.
            </span>
          </div>
        ) : filteredDashboards.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-gray-400)',
            }}
          >
            No dashboards match "{searchQuery}"
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {filteredDashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  transition: 'border-color var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-gray-600)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-gray-700)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                  }}
                >
                  {/* Dashboard info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={dashboard.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--color-primary)',
                        fontWeight: 500,
                        textDecoration: 'none',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.textDecoration = 'underline'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.textDecoration = 'none'
                      }}
                    >
                      {dashboard.title}
                    </a>
                    <p
                      style={{
                        margin: 'var(--space-1) 0 0 0',
                        color: 'var(--color-gray-500)',
                        fontSize: 'var(--text-sm)',
                      }}
                    >
                      /{dashboard.slug}
                    </p>
                    <p
                      style={{
                        margin: 'var(--space-1) 0 0 0',
                        color: 'var(--color-gray-600)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      Updated {formatDate(dashboard.updated_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      flexShrink: 0,
                    }}
                  >
                    <a
                      href={dashboard.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--color-gray-400)',
                        fontSize: 'var(--text-sm)',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--color-gray-200)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--color-gray-400)'
                      }}
                    >
                      Open
                    </a>

                    <span style={{ color: 'var(--color-gray-700)' }}>|</span>

                    <button
                      onClick={() => navigate(`/dashboard/${dashboard.slug}`)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary)',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      View in React
                    </button>

                    <span style={{ color: 'var(--color-gray-700)' }}>|</span>

                    {deleteConfirm === dashboard.slug ? (
                      <>
                        <button
                          onClick={() => handleDelete(dashboard.slug)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-error)',
                            fontSize: 'var(--text-sm)',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-gray-400)',
                            fontSize: 'var(--text-sm)',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleDelete(dashboard.slug)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-gray-400)',
                          fontSize: 'var(--text-sm)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-error)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-gray-400)'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
