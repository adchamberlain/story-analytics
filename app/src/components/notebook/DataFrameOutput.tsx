import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotebookStore } from '../../stores/notebookStore'

interface DataFrameOutputProps {
  html: string
}

export function DataFrameOutput({ html }: DataFrameOutputProps) {
  const navigate = useNavigate()
  const { getDataframes, chartDataframe } = useNotebookStore()
  const [charting, setCharting] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [availableDfs, setAvailableDfs] = useState<Record<string, { rows: number; columns: string[] }>>({})

  const handleChart = async () => {
    setCharting(true)
    try {
      const dfs = await getDataframes()
      const names = Object.keys(dfs)
      if (names.length === 0) {
        setCharting(false)
        return
      }
      if (names.length === 1) {
        // Only one DataFrame — chart it directly
        const { sourceId } = await chartDataframe(names[0])
        navigate(`/editor/new?sourceId=${sourceId}`)
      } else {
        // Multiple — show picker
        setAvailableDfs(dfs)
        setShowPicker(true)
        setCharting(false)
      }
    } catch {
      setCharting(false)
    }
  }

  const handlePickDf = async (name: string) => {
    setShowPicker(false)
    setCharting(true)
    try {
      const { sourceId } = await chartDataframe(name)
      navigate(`/editor/new?sourceId=${sourceId}`)
    } catch {
      setCharting(false)
    }
  }

  return (
    <div>
      <div
        className="notebook-dataframe overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <div className="flex items-center gap-2 mt-2 relative">
        <button
          onClick={handleChart}
          disabled={charting}
          className="text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 font-medium disabled:opacity-50 flex items-center gap-1.5 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          {charting ? 'Loading...' : 'Chart this data'}
        </button>

        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 bg-surface border border-border-default rounded-lg shadow-lg p-2 z-20">
            <div className="text-xs text-text-muted mb-2 px-2">Select a DataFrame:</div>
            {Object.entries(availableDfs).map(([name, info]) => (
              <button
                key={name}
                onClick={() => handlePickDf(name)}
                className="w-full text-left px-3 py-1.5 text-xs rounded hover:bg-surface-secondary transition-colors"
              >
                <span className="font-mono font-medium text-text-primary">{name}</span>
                <span className="text-text-muted ml-2">({info.rows} rows, {info.columns.length} cols)</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
