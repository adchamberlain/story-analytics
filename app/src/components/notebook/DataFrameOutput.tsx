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

  const handleChart = async () => {
    setCharting(true)
    try {
      const dfs = await getDataframes()
      if (dfs.length === 0) {
        setCharting(false)
        return
      }
      // Use the first dataframe (most common case)
      const { sourceId } = await chartDataframe(dfs[0])
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
      <div
        className="notebook-dataframe overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
