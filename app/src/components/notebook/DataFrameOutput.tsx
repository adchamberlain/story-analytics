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
        navigate(`/editor/new/source?sourceId=${sourceId}`)
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
      navigate(`/editor/new/source?sourceId=${sourceId}`)
    } catch {
      setCharting(false)
    }
  }

  return (
    <div className="relative group">
      <button
        onClick={handleChart}
        disabled={charting}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 font-medium disabled:opacity-50 z-10"
      >
        {charting ? 'Loading...' : 'Chart this →'}
      </button>

      {showPicker && (
        <div className="absolute top-10 right-2 bg-surface border border-border-default rounded-lg shadow-lg p-2 z-20">
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

      <div
        className="notebook-dataframe overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
