/**
 * Charts library page.
 * Grid view of saved charts with search, filter, and preview.
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useChartStore } from '../stores/chartStore'
import { ChartFactory } from '../components/charts/ChartFactory'
import { fetchChartRenderData, updateChart, duplicateChart } from '../api/client'
import type { ChartRenderData, ChartType } from '../types/chart'
import { createDashboardFromCharts } from '../api/client'
import { CreateDashboardModal } from '../components/modals'
import { ChartConfigEditor } from '../components/editors'
import type { ChartLibraryItem } from '../types/conversation'

const CHART_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'LineChart', label: 'Line' },
  { value: 'BarChart', label: 'Bar' },
  { value: 'AreaChart', label: 'Area' },
  { value: 'BigValue', label: 'KPI' },
  { value: 'DataTable', label: 'Table' },
]

/**
 * Format SQL for display with proper line breaks and indentation.
 * Puts each SELECT column on its own line for readability.
 */
function formatSQL(sql: string): string {
  if (!sql) return ''

  let formatted = sql.trim()

  // Normalize whitespace first
  formatted = formatted.replace(/\s+/g, ' ')

  // Handle CTEs first - separate them from the main query
  // Match WITH ... AS (...) and mark the boundary before main SELECT
  formatted = formatted.replace(
    /\bWITH\s+(\w+)\s+AS\s*\((.+?)\)\s*SELECT\b/gi,
    (_match, cteName, cteBody) => {
      // Format the CTE body - split SELECT columns if present
      let formattedCte = cteBody.trim()

      // Check if CTE has SELECT ... FROM
      const cteSelectMatch = formattedCte.match(/^SELECT\s+(.+?)\s+FROM\s+(.+)$/i)
      if (cteSelectMatch) {
        const [, cols, rest] = cteSelectMatch
        const cteCols = splitByCommaOutsideParens(cols)
        if (cteCols.length > 1) {
          formattedCte = `SELECT\n    ${cteCols.map(c => c.trim()).join(',\n    ')}\n  FROM ${rest}`
        }
      } else {
        // CTE without FROM - check if it's a single SELECT with long function call
        const selectMatch = formattedCte.match(/^SELECT\s+(.+)$/i)
        if (selectMatch) {
          const selectBody = selectMatch[1]
          // If it contains a function with multiple args, format it
          formattedCte = `SELECT\n    ${formatLongFunctionCall(selectBody)}`
        }
      }

      return `WITH ${cteName} AS (\n  ${formattedCte}\n)\n\nSELECT`
    }
  )

  // Now split SELECT columns for the main query (after CTE handling)
  // Look for SELECT ... FROM where SELECT is either at start or after newlines
  formatted = formatted.replace(
    /(\n\n?SELECT|\bSELECT)\s+(.+?)\s+FROM\b/gi,
    (_match, selectPart, columns) => {
      const cols = splitByCommaOutsideParens(columns.trim())
      const prefix = selectPart.includes('\n') ? selectPart : 'SELECT'
      if (cols.length > 1) {
        const indentedCols = cols.map(c => '  ' + c.trim()).join(',\n')
        return `${prefix}\n${indentedCols}\nFROM`
      }
      return `${prefix} ${columns.trim()}\nFROM`
    }
  )

  // Protect multi-word keywords with placeholders
  const multiWordKeywords = [
    { search: /\bLEFT\s+OUTER\s+JOIN\b/gi, placeholder: '___LEFT_OUTER_JOIN___', restore: 'LEFT OUTER JOIN' },
    { search: /\bRIGHT\s+OUTER\s+JOIN\b/gi, placeholder: '___RIGHT_OUTER_JOIN___', restore: 'RIGHT OUTER JOIN' },
    { search: /\bFULL\s+OUTER\s+JOIN\b/gi, placeholder: '___FULL_OUTER_JOIN___', restore: 'FULL OUTER JOIN' },
    { search: /\bLEFT\s+JOIN\b/gi, placeholder: '___LEFT_JOIN___', restore: 'LEFT JOIN' },
    { search: /\bRIGHT\s+JOIN\b/gi, placeholder: '___RIGHT_JOIN___', restore: 'RIGHT JOIN' },
    { search: /\bINNER\s+JOIN\b/gi, placeholder: '___INNER_JOIN___', restore: 'INNER JOIN' },
    { search: /\bOUTER\s+JOIN\b/gi, placeholder: '___OUTER_JOIN___', restore: 'OUTER JOIN' },
    { search: /\bCROSS\s+JOIN\b/gi, placeholder: '___CROSS_JOIN___', restore: 'CROSS JOIN' },
    { search: /\bFULL\s+JOIN\b/gi, placeholder: '___FULL_JOIN___', restore: 'FULL JOIN' },
    { search: /\bGROUP\s+BY\b/gi, placeholder: '___GROUP_BY___', restore: 'GROUP BY' },
    { search: /\bORDER\s+BY\b/gi, placeholder: '___ORDER_BY___', restore: 'ORDER BY' },
  ]

  for (const { search, placeholder } of multiWordKeywords) {
    formatted = formatted.replace(search, placeholder)
  }

  // Add line breaks before keywords
  const lineBreakKeywords = [
    '___LEFT_OUTER_JOIN___', '___RIGHT_OUTER_JOIN___', '___FULL_OUTER_JOIN___',
    '___LEFT_JOIN___', '___RIGHT_JOIN___', '___INNER_JOIN___', '___OUTER_JOIN___',
    '___CROSS_JOIN___', '___FULL_JOIN___', 'JOIN',
    '___GROUP_BY___', '___ORDER_BY___',
    'WHERE', 'HAVING', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT'
  ]

  for (const keyword of lineBreakKeywords) {
    const regex = new RegExp(`\\s+(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    formatted = formatted.replace(regex, '\n$1')
  }

  // Add line breaks before AND/OR with indent (only at top level, not inside parentheses)
  // Use a smarter approach: only break AND/OR that aren't inside parentheses
  formatted = formatAndOr(formatted)

  // Restore multi-word keywords from placeholders
  for (const { placeholder, restore } of multiWordKeywords) {
    formatted = formatted.replace(new RegExp(placeholder, 'g'), restore)
  }

  // Clean up multiple line breaks
  formatted = formatted.replace(/\n{3,}/g, '\n\n')

  // Normalize spaces after newlines
  formatted = formatted
    .split('\n')
    .map(line => {
      const trimmed = line.trimEnd()
      if (trimmed.startsWith('  ')) return trimmed
      return trimmed.trimStart()
    })
    .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i-1].length > 0))
    .join('\n')

  return formatted.trim()
}

/**
 * Add line breaks before AND/OR only when they're not inside parentheses.
 */
function formatAndOr(sql: string): string {
  let result = ''
  let depth = 0
  let i = 0

  while (i < sql.length) {
    const char = sql[i]

    if (char === '(') {
      depth++
      result += char
      i++
    } else if (char === ')') {
      depth--
      result += char
      i++
    } else if (depth === 0) {
      // Check for AND or OR at top level
      const remaining = sql.slice(i)
      const andMatch = remaining.match(/^(\s+)(AND)(\s+)/i)
      const orMatch = remaining.match(/^(\s+)(OR)(\s+)/i)

      if (andMatch) {
        result += '\n  AND '
        i += andMatch[0].length
      } else if (orMatch) {
        result += '\n  OR '
        i += orMatch[0].length
      } else {
        result += char
        i++
      }
    } else {
      result += char
      i++
    }
  }

  return result
}

/**
 * Format long function calls by putting each argument on its own line.
 * Only formats if the total length exceeds a threshold.
 */
function formatLongFunctionCall(str: string, indent: string = '    '): string {
  const LINE_LENGTH_THRESHOLD = 80

  if (str.length <= LINE_LENGTH_THRESHOLD) {
    return str
  }

  // Find the outermost function call with arguments
  // Pattern: FUNC_NAME(args)suffix where suffix might be ::TYPE AS alias
  const funcMatch = str.match(/^(\w+)\((.+)\)((::\w+)?(\s+AS\s+\w+)?)$/i)
  if (!funcMatch) {
    return str
  }

  const [, funcName, argsStr, suffix] = funcMatch
  const args = splitByCommaOutsideParens(argsStr)

  // Recursively format nested function calls in arguments
  const formattedArgs = args.map(arg => {
    const trimmed = arg.trim()
    if (trimmed.length > LINE_LENGTH_THRESHOLD) {
      return formatLongFunctionCall(trimmed, indent + '  ')
    }
    return trimmed
  })

  // If only 1 argument but it was reformatted (contains newlines), still format the outer call
  if (args.length === 1) {
    const formattedArg = formattedArgs[0]
    if (formattedArg.includes('\n')) {
      return `${funcName}(\n${indent}  ${formattedArg}\n${indent})${suffix || ''}`
    }
    // Single arg, not reformatted, return as-is
    return str
  }

  // Multiple arguments - format each on its own line
  return `${funcName}(\n${indent}  ${formattedArgs.join(',\n' + indent + '  ')}\n${indent})${suffix || ''}`
}


/**
 * Split a string by commas, but ignore commas inside parentheses.
 */
function splitByCommaOutsideParens(str: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0

  for (const char of str) {
    if (char === '(') {
      depth++
      current += char
    } else if (char === ')') {
      depth--
      current += char
    } else if (char === ',' && depth === 0) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    result.push(current)
  }

  return result
}

const CHART_ICONS: Record<string, string> = {
  LineChart: '~',
  BarChart: '~',
  AreaChart: '^',
  BigValue: '*',
  DataTable: '=',
  ScatterPlot: '.',
  DualTrendChart: '~',
  Histogram: '~',
  FunnelChart: 'v',
  Heatmap: '%',
  default: '~',
}

export function ChartsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    charts,
    loading,
    error,
    searchQuery,
    filterType,
    previewChart,
    selectionMode,
    selectedChartIds,
    loadCharts,
    deleteChart,
    setSearchQuery,
    setFilterType,
    toggleSelectionMode,
    toggleChartSelection,
    clearSelection,
    openPreview,
    closePreview,
  } = useChartStore()

  // Local state for direct chart rendering in preview modal
  const [previewRenderData, setPreviewRenderData] = useState<ChartRenderData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Modal action state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [isDuplicating, setIsDuplicating] = useState(false)

  // SQL editing state
  const [isEditingSQL, setIsEditingSQL] = useState(false)
  const [editedSQL, setEditedSQL] = useState('')
  const [isSavingSQL, setIsSavingSQL] = useState(false)
  const [sqlSaveError, setSqlSaveError] = useState<string | null>(null)

  // Config editor state
  const [showConfigEditor, setShowConfigEditor] = useState(false)


  // Get selected chart objects for the modal
  const selectedCharts = charts.filter((c) => selectedChartIds.includes(c.id))

  // Load charts on mount
  useEffect(() => {
    loadCharts()
  }, [loadCharts])

  // Handle preview query param - auto-open modal if chart ID is in URL
  useEffect(() => {
    const previewId = searchParams.get('preview')
    if (previewId && charts.length > 0 && !previewChart) {
      const chartToPreview = charts.find((c) => c.id === previewId)
      if (chartToPreview) {
        openPreview(chartToPreview)
        // Clear the preview param from URL to avoid re-opening on refresh
        searchParams.delete('preview')
        setSearchParams(searchParams, { replace: true })
      }
    }
  }, [searchParams, setSearchParams, charts, previewChart, openPreview])

  // Load chart render data when preview opens
  useEffect(() => {
    if (previewChart) {
      setPreviewLoading(true)
      setPreviewRenderData(null)
      fetchChartRenderData(previewChart.id)
        .then((data) => {
          setPreviewRenderData(data)
        })
        .catch((err) => {
          console.error('Failed to load chart preview:', err)
        })
        .finally(() => {
          setPreviewLoading(false)
        })
    } else {
      setPreviewRenderData(null)
    }
  }, [previewChart])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch)
        loadCharts(localSearch, filterType)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch, searchQuery, filterType, setSearchQuery, loadCharts])

  const handleFilterChange = useCallback(
    (type: string) => {
      setFilterType(type)
      loadCharts(searchQuery, type)
    },
    [setFilterType, loadCharts, searchQuery]
  )

  const handleDelete = async (chart: ChartLibraryItem) => {
    if (deleteConfirm !== chart.id) {
      setDeleteConfirm(chart.id)
      return
    }
    try {
      await deleteChart(chart.id)
      setDeleteConfirm(null)
    } catch {
      alert('Failed to delete chart')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getChartIcon = (type: string) => CHART_ICONS[type] || CHART_ICONS.default

  // Handle dashboard creation
  const handleCreateDashboard = async (title: string, description: string | null) => {
    setIsCreating(true)
    try {
      const response = await createDashboardFromCharts(title, description, selectedChartIds)
      if (response.success && response.dashboard_url) {
        // Clear selection and close modal
        clearSelection()
        toggleSelectionMode()
        setShowCreateModal(false)
        // Navigate to the new dashboard
        navigate(response.dashboard_url)
      } else {
        throw new Error(response.error || 'Failed to create dashboard')
      }
    } finally {
      setIsCreating(false)
    }
  }

  // Handle canceling selection mode
  const handleCancelSelection = () => {
    clearSelection()
    toggleSelectionMode()
  }

  // Handle chart card click in selection mode
  const handleCardClick = (chart: ChartLibraryItem) => {
    if (selectionMode) {
      toggleChartSelection(chart.id)
    } else {
      openPreview(chart)
    }
  }

  // Handle starting rename mode
  const handleStartRename = () => {
    if (previewChart) {
      setRenameTitle(previewChart.title)
      setIsRenaming(true)
    }
  }

  // Handle saving the rename
  const handleSaveRename = async () => {
    if (!previewChart || !renameTitle.trim()) return

    try {
      const result = await updateChart(previewChart.id, { title: renameTitle.trim() })
      if (result.success && result.chart) {
        // Update the chart in the list
        loadCharts()
        // Update previewChart state (close and reopen to refresh)
        closePreview()
        // Find and open the updated chart
        setTimeout(() => {
          const chart = { ...previewChart, title: result.chart!.title }
          openPreview(chart)
        }, 100)
      } else {
        alert(result.error || 'Failed to rename chart')
      }
    } catch (err) {
      console.error('Failed to rename chart:', err)
      alert('Failed to rename chart')
    } finally {
      setIsRenaming(false)
      setRenameTitle('')
    }
  }

  // Handle cancel rename
  const handleCancelRename = () => {
    setIsRenaming(false)
    setRenameTitle('')
  }

  // Handle edit chart (navigate to focused edit page)
  const handleEditChart = async () => {
    if (!previewChart) return

    closePreview()
    navigate(`/chart/${previewChart.id}/edit`)
  }

  // Handle duplicate chart
  const handleDuplicateChart = async () => {
    if (!previewChart) return

    setIsDuplicating(true)
    try {
      const result = await duplicateChart(previewChart.id)
      // Refresh the chart list
      await loadCharts()
      // Close current preview and open the new chart
      closePreview()
      setTimeout(() => {
        openPreview(result.chart)
      }, 100)
    } catch (err) {
      console.error('Failed to duplicate chart:', err)
      alert('Failed to duplicate chart')
    } finally {
      setIsDuplicating(false)
    }
  }

  // Handle starting SQL edit
  const handleStartSQLEdit = () => {
    if (previewChart) {
      setEditedSQL(previewChart.sql)
      setSqlSaveError(null)
      setIsEditingSQL(true)
    }
  }

  // Handle canceling SQL edit
  const handleCancelSQLEdit = () => {
    setEditedSQL('')
    setSqlSaveError(null)
    setIsEditingSQL(false)
  }

  // Handle saving SQL edit
  const handleSaveSQLEdit = async () => {
    if (!previewChart) return

    setIsSavingSQL(true)
    setSqlSaveError(null)

    try {
      const result = await updateChart(previewChart.id, { sql: editedSQL })
      if (result.success) {
        // Refresh the chart list
        await loadCharts()
        // Reload the preview data
        setPreviewLoading(true)
        const data = await fetchChartRenderData(previewChart.id)
        setPreviewRenderData(data)
        setPreviewLoading(false)
        setIsEditingSQL(false)
      } else {
        setSqlSaveError(result.error || 'Failed to save SQL')
      }
    } catch (err) {
      setSqlSaveError(err instanceof Error ? err.message : 'Failed to save SQL')
    } finally {
      setIsSavingSQL(false)
    }
  }

  // Handle config editor save
  const handleConfigEditorSave = async () => {
    // Refresh the chart list
    await loadCharts()
    // Reload the preview data
    if (previewChart) {
      setPreviewLoading(true)
      try {
        const data = await fetchChartRenderData(previewChart.id)
        setPreviewRenderData(data)
      } catch (err) {
        console.error('Failed to reload preview:', err)
      } finally {
        setPreviewLoading(false)
      }
    }
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
          Charts
        </h1>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {selectionMode ? (
            <>
              {/* Cancel Selection */}
              <button
                onClick={handleCancelSelection}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--color-gray-700)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              {/* Selection Count */}
              <span
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-300)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {selectedChartIds.length} selected
              </span>

              {/* Create Dashboard */}
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={selectedChartIds.length === 0}
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
                  cursor: selectedChartIds.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedChartIds.length === 0 ? 0.5 : 1,
                }}
              >
                Create Dashboard
              </button>
            </>
          ) : (
            <>
              {/* Select Charts */}
              <button
                onClick={toggleSelectionMode}
                disabled={charts.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--color-gray-700)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: charts.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: charts.length === 0 ? 0.5 : 1,
                }}
              >
                Select Charts
              </button>

              {/* Search */}
              <input
                type="text"
                placeholder="Search charts..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-sm)',
                  width: '200px',
                }}
              />

              {/* Filter */}
              <select
                value={filterType}
                onChange={(e) => handleFilterChange(e.target.value)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-gray-800)',
                  border: '1px solid var(--color-gray-700)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                }}
              >
                {CHART_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              {/* Build Dashboard */}
              <button
                onClick={() => navigate('/dashboards/new')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-4)',
                  backgroundColor: 'var(--color-gray-700)',
                  border: '1px solid var(--color-gray-600)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-200)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Build Dashboard
              </button>

              {/* New Chart */}
              <button
                onClick={() => navigate('/charts/new')}
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
                + New Chart
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-4)',
        }}
      >
        {loading ? (
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
            <div
              style={{
                width: '24px',
                height: '24px',
                border: '2px solid var(--color-gray-700)',
                borderTopColor: 'var(--color-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: 'var(--space-4)',
              }}
            />
            Loading charts...
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-12)',
              color: 'var(--color-error)',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => loadCharts()}
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--color-gray-700)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-gray-300)',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        ) : charts.length === 0 ? (
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
            <span style={{ fontSize: 'var(--text-lg)' }}>No charts yet.</span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-gray-500)',
                marginTop: 'var(--space-2)',
              }}
            >
              Create your first chart to see it here.
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {charts.map((chart) => {
              const isSelected = selectedChartIds.includes(chart.id)
              return (
              <div
                key={chart.id}
                onClick={() => handleCardClick(chart)}
                style={{
                  backgroundColor: 'var(--color-gray-800)',
                  border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-gray-700)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--color-primary)'
                  }
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--color-gray-700)'
                  }
                  e.currentTarget.style.transform = 'none'
                }}
              >
                {/* Selection checkbox overlay */}
                {selectionMode && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'var(--space-2)',
                      left: 'var(--space-2)',
                      width: '20px',
                      height: '20px',
                      borderRadius: 'var(--radius-sm)',
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-gray-500)'}`,
                      backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {isSelected && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6l3 3 5-6" />
                      </svg>
                    )}
                  </div>
                )}
                {/* Card header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--color-warning)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-lg)',
                    }}
                  >
                    {getChartIcon(chart.chart_type)}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-gray-400)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {chart.chart_type}
                  </span>
                </div>

                {/* Title */}
                <h3
                  style={{
                    margin: '0 0 var(--space-2) 0',
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    color: 'var(--color-gray-200)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chart.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    margin: '0 0 var(--space-3) 0',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-gray-400)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.4,
                  }}
                >
                  {chart.description || chart.original_request}
                </p>

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-gray-500)',
                    }}
                  >
                    {formatDate(chart.created_at)}
                  </span>

                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    {deleteConfirm === chart.id ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(chart)
                          }}
                          style={{
                            padding: 'var(--space-1) var(--space-2)',
                            backgroundColor: 'var(--color-error)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'white',
                            fontSize: 'var(--text-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(null)
                          }}
                          style={{
                            padding: 'var(--space-1) var(--space-2)',
                            backgroundColor: 'var(--color-gray-700)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-gray-300)',
                            fontSize: 'var(--text-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(chart)
                        }}
                        style={{
                          padding: 'var(--space-1) var(--space-2)',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-gray-500)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--color-error)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--color-gray-500)'
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )})}

          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewChart && (
        <div
          onClick={() => {
            setIsRenaming(false)
            setIsEditingSQL(false)
            setSqlSaveError(null)
            closePreview()
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-8)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--color-gray-800)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-4) var(--space-6)',
                borderBottom: '1px solid var(--color-gray-700)',
              }}
            >
              {isRenaming ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
                  <input
                    type="text"
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename()
                      if (e.key === 'Escape') handleCancelRename()
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: 'var(--text-lg)',
                      backgroundColor: 'var(--color-gray-900)',
                      border: '1px solid var(--color-primary)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-gray-200)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSaveRename}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      color: 'white',
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelRename}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-gray-700)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-gray-300)',
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <h2
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-xl)',
                    color: 'var(--color-gray-200)',
                  }}
                >
                  {previewChart.title}
                </h2>
              )}
              <button
                onClick={() => {
                  setIsRenaming(false)
                  setIsEditingSQL(false)
                  setSqlSaveError(null)
                  closePreview()
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-gray-400)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 'var(--space-2)',
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal body */}
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: '400px',
                padding: 'var(--space-4)',
                backgroundColor: 'white',
              }}
            >
              {previewLoading ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--color-gray-400)',
                  }}
                >
                  Loading preview...
                </div>
              ) : previewRenderData ? (
                <ChartFactory
                  spec={previewRenderData.spec}
                  data={previewRenderData.data}
                  columns={previewRenderData.columns}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--color-gray-400)',
                  }}
                >
                  Failed to load preview
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              style={{
                padding: 'var(--space-4) var(--space-6)',
                borderTop: '1px solid var(--color-gray-700)',
              }}
            >
              {/* Action buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <button
                  onClick={handleEditChart}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--color-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                  }}
                >
                  Edit with AI
                </button>
                <button
                  onClick={() => setShowConfigEditor(true)}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--color-gray-700)',
                    border: '1px solid var(--color-gray-600)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-gray-200)',
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                  }}
                >
                  Edit Config
                </button>
                <button
                  onClick={handleDuplicateChart}
                  disabled={isDuplicating}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--color-gray-700)',
                    border: '1px solid var(--color-gray-600)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-gray-200)',
                    fontSize: 'var(--text-sm)',
                    cursor: isDuplicating ? 'not-allowed' : 'pointer',
                    opacity: isDuplicating ? 0.5 : 1,
                  }}
                >
                  {isDuplicating ? 'Duplicating...' : 'Duplicate'}
                </button>
                <button
                  onClick={handleStartRename}
                  disabled={isRenaming}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'var(--color-gray-700)',
                    border: '1px solid var(--color-gray-600)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-gray-200)',
                    fontSize: 'var(--text-sm)',
                    cursor: isRenaming ? 'not-allowed' : 'pointer',
                    opacity: isRenaming ? 0.5 : 1,
                  }}
                >
                  Rename
                </button>
              </div>

              {/* Description */}
              <p
                style={{
                  margin: '0 0 var(--space-3) 0',
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {previewChart.description}
              </p>

              {/* Code Tabs */}
              <div
                style={{
                  backgroundColor: 'var(--color-gray-900)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-2) var(--space-4)',
                    borderBottom: '1px solid var(--color-gray-700)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-gray-400)',
                      fontWeight: 500,
                    }}
                  >
                    SQL
                  </span>
                  {!isEditingSQL && (
                    <button
                      onClick={() => navigator.clipboard.writeText(previewChart.sql)}
                      style={{
                        padding: 'var(--space-1) var(--space-3)',
                        backgroundColor: 'var(--color-gray-700)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-gray-300)',
                        fontSize: 'var(--text-xs)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                      }}
                    >
                      Copy
                    </button>
                  )}
                </div>

                {/* Code content or edit textarea */}
                {isEditingSQL ? (
                  <div style={{ padding: 'var(--space-3)' }}>
                    <textarea
                      value={editedSQL}
                      onChange={(e) => setEditedSQL(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: '150px',
                        padding: 'var(--space-3)',
                        backgroundColor: 'var(--color-gray-800)',
                        border: '1px solid var(--color-gray-600)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-gray-200)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        lineHeight: 1.5,
                        resize: 'vertical',
                      }}
                    />
                    {sqlSaveError && (
                      <p
                        style={{
                          margin: 'var(--space-2) 0 0 0',
                          color: 'var(--color-error)',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {sqlSaveError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div style={{ maxHeight: '150px', overflow: 'auto' }}>
                    <pre
                      style={{
                        margin: 0,
                        padding: 'var(--space-3)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-gray-400)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.5,
                      }}
                    >
                      {formatSQL(previewChart.sql)}
                    </pre>
                  </div>
                )}

                {/* Action buttons for SQL editing */}
                <div
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    borderTop: '1px solid var(--color-gray-700)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {isEditingSQL ? (
                    <>
                      <div />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          onClick={handleCancelSQLEdit}
                          style={{
                            padding: 'var(--space-1) var(--space-3)',
                            backgroundColor: 'var(--color-gray-700)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-gray-300)',
                            fontSize: 'var(--text-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveSQLEdit}
                          disabled={isSavingSQL}
                          style={{
                            padding: 'var(--space-1) var(--space-3)',
                            backgroundColor: 'var(--color-primary)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'white',
                            fontSize: 'var(--text-xs)',
                            cursor: isSavingSQL ? 'not-allowed' : 'pointer',
                            opacity: isSavingSQL ? 0.7 : 1,
                          }}
                        >
                          {isSavingSQL ? 'Saving...' : 'Save & Run'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleStartSQLEdit}
                        style={{
                          padding: 'var(--space-1) var(--space-3)',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--color-gray-600)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-gray-400)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        Edit SQL
                      </button>
                      <div />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config Editor Modal */}
      {showConfigEditor && previewChart && previewRenderData && (
        <ChartConfigEditor
          chartId={previewChart.id}
          chartType={previewChart.chart_type as ChartType}
          initialConfig={previewRenderData.spec.config}
          onClose={() => setShowConfigEditor(false)}
          onSave={handleConfigEditorSave}
        />
      )}

      {/* Create Dashboard Modal */}
      {showCreateModal && (
        <CreateDashboardModal
          selectedCharts={selectedCharts}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateDashboard}
          isLoading={isCreating}
        />
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
