import type { CellOutput as CellOutputType } from '../../stores/notebookStore'
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

function SingleOutput({ output }: { output: CellOutputType }) {
  // Stream output
  if (output.output_type === 'stream') {
    const isStderr = output.name === 'stderr'
    return (
      <pre
        className={`text-[13px] font-mono whitespace-pre-wrap leading-relaxed ${
          isStderr ? 'text-red-500' : 'text-text-primary'
        }`}
      >
        {output.text ?? ''}
      </pre>
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
      return (
        <pre className="text-[13px] font-mono text-text-primary whitespace-pre-wrap leading-relaxed">
          {data['text/plain']}
        </pre>
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
