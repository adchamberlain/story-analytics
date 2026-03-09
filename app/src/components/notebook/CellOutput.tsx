import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CellOutput as CellOutputType } from '../../stores/notebookStore'
import { useNotebookStore } from '../../stores/notebookStore'
import { DataFrameOutput } from './DataFrameOutput'

/** Strip ANSI escape codes from traceback strings. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

function isDataFrameHtml(html: string): boolean {
  const lower = html.toLowerCase()
  return lower.includes('dataframe') || lower.includes('<table')
}

/** Detect plain-text DataFrame output (from print(df) or df.head()). */
function isDataFrameText(text: string): boolean {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return false
  // Check for numbered index rows (0  val  val, 1  val  val, etc.)
  const dataLines = lines.slice(1)
  const numberedLines = dataLines.filter((l) => /^\d+\s+/.test(l.trim()))
  return numberedLines.length >= 2 && numberedLines.length >= dataLines.length * 0.5
}

function ChartDataButton() {
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
        const { sourceId } = await chartDataframe(names[0])
        navigate(`/editor/new?sourceId=${sourceId}`)
      } else {
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
  )
}

function SingleOutput({ output }: { output: CellOutputType }) {
  // Stream output
  if (output.output_type === 'stream') {
    const isStderr = output.name === 'stderr'
    const text = output.text ?? ''
    const showChart = !isStderr && isDataFrameText(text)
    return (
      <div>
        <pre
          className={`text-[13px] font-mono whitespace-pre-wrap leading-relaxed ${
            isStderr ? 'text-red-500' : 'text-text-primary'
          }`}
        >
          {text}
        </pre>
        {showChart && <ChartDataButton />}
      </div>
    )
  }

  // Error output
  if (output.output_type === 'error') {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
        <div className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
          {output.ename}: {output.evalue}
        </div>
        {output.traceback && output.traceback.length > 0 && (
          <pre className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap mt-2 leading-relaxed">
            {output.traceback.map(stripAnsi).join('\n')}
          </pre>
        )}
      </div>
    )
  }

  // execute_result / display_data
  if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
    const data = output.data
    if (!data) return null

    // HTML with dataframe/table
    if (data['text/html'] && isDataFrameHtml(data['text/html'])) {
      return <DataFrameOutput html={data['text/html']} />
    }

    // Generic HTML
    if (data['text/html']) {
      return (
        <div
          className="notebook-html-output"
          dangerouslySetInnerHTML={{ __html: data['text/html'] }}
        />
      )
    }

    // PNG image
    if (data['image/png']) {
      return (
        <img
          src={`data:image/png;base64,${data['image/png']}`}
          alt="Cell output"
          className="max-w-full"
        />
      )
    }

    // SVG
    if (data['image/svg+xml']) {
      return (
        <div
          className="notebook-svg-output"
          dangerouslySetInnerHTML={{ __html: data['image/svg+xml'] }}
        />
      )
    }

    // Fallback: plain text
    if (data['text/plain']) {
      const plainText = data['text/plain']
      const showChart = isDataFrameText(plainText)
      return (
        <div>
          <pre className="text-[13px] font-mono text-text-primary whitespace-pre-wrap leading-relaxed">
            {plainText}
          </pre>
          {showChart && <ChartDataButton />}
        </div>
      )
    }
  }

  return null
}

interface CellOutputProps {
  outputs: CellOutputType[]
}

export function CellOutput({ outputs }: CellOutputProps) {
  if (!outputs || outputs.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-t border-border-default bg-surface">
      {outputs.map((output, i) => (
        <SingleOutput key={i} output={output} />
      ))}
    </div>
  )
}
