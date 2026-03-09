import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { defaultKeymap } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, CompletionContext } from '@codemirror/autocomplete'
import { useThemeStore } from '../../stores/themeStore'
import { useNotebookStore } from '../../stores/notebookStore'
import type { NotebookCell as NotebookCellType } from '../../stores/notebookStore'
import { CellOutput } from './CellOutput'
import { CellToolbar } from './CellToolbar'
import { InlineChartPreview } from './InlineChartPreview'

// Light theme matching SqlEditor exactly
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },
  '.cm-gutters': {
    backgroundColor: '#f9fafb',
    color: '#999999',
    borderRight: '1px solid #e5e7eb',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(59,130,246,0.04)' },
  '.cm-activeLineGutter': { backgroundColor: '#f3f4f6' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(59,130,246,0.12)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#1a1a1a' },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(59,130,246,0.2)',
  },
})

function getLanguageExtension(cellType: 'code' | 'markdown' | 'sql') {
  switch (cellType) {
    case 'code':
      return python()
    case 'sql':
      return sql()
    case 'markdown':
      return markdown()
  }
}

/** Render markdown source as HTML (simple approach). */
function renderMarkdown(source: string): string {
  // Simple markdown rendering — bold, italic, headers, code, links
  let html = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-1">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code class="bg-surface-inset px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')

  // Line breaks
  html = html.replace(/\n/g, '<br />')

  return html
}

interface NotebookCellProps {
  cell: NotebookCellType
  sqlSchema?: Record<string, string[]>
}

export function NotebookCell({ cell, sqlSchema }: NotebookCellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const resolved = useThemeStore((s) => s.resolved)
  const { updateCellSource, executeCell } = useNotebookStore()
  const executeCellRef = useRef(executeCell)
  executeCellRef.current = executeCell

  const [editing, setEditing] = useState(cell.cell_type !== 'markdown')
  const [showDfHint, setShowDfHint] = useState(false)

  // For markdown cells: show rendered view by default, click to edit
  const isMarkdown = cell.cell_type === 'markdown'

  const onSourceChange = useCallback(
    (value: string) => {
      updateCellSource(cell.id, value)
    },
    [cell.id, updateCellSource],
  )

  // SQL autocomplete: table + column names from DuckDB sources
  const schemaCompletion = useCallback(
    (context: CompletionContext) => {
      if (!sqlSchema) return null
      const word = context.matchBefore(/[\w.]*/)
      if (!word || (word.from === word.to && !context.explicit)) return null
      const options = []
      for (const [table, columns] of Object.entries(sqlSchema)) {
        options.push({ label: table, type: 'class' as const })
        for (const col of columns) {
          options.push({ label: col, type: 'property' as const, detail: table })
        }
      }
      return { from: word.from, options }
    },
    [sqlSchema],
  )

  // Memoize autocomplete extension so it updates when schema changes
  const autocompleteExt = useMemo(
    () => (cell.cell_type === 'sql' && sqlSchema && Object.keys(sqlSchema).length > 0
      ? autocompletion({ override: [schemaCompletion] })
      : autocompletion()),
    [cell.cell_type, sqlSchema, schemaCompletion],
  )

  useEffect(() => {
    if (isMarkdown && !editing) return
    if (!containerRef.current) return

    // Preserve content across recreations
    const currentDoc = viewRef.current?.state.doc.toString()

    const runKeymap = keymap.of([
      {
        key: 'Shift-Enter',
        run: () => {
          executeCellRef.current(cell.id)
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: currentDoc ?? cell.source,
      extensions: [
        runKeymap,
        keymap.of([...defaultKeymap, ...searchKeymap]),
        getLanguageExtension(cell.cell_type),
        autocompleteExt,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        resolved === 'dark' ? oneDark : lightTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onSourceChange(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { fontSize: '13px', minHeight: '40px' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: 'ui-monospace, monospace', padding: '8px 0' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.cell_type, resolved, editing, autocompleteExt])

  // Execution count display
  const execLabel =
    cell.execution_count != null ? `[${cell.execution_count}]` : cell.running ? '[*]' : '[ ]'

  // Cell type label for the header
  const typeLabel = cell.cell_type === 'code' ? 'Python' : cell.cell_type === 'sql' ? 'SQL' : 'Markdown'

  return (
    <div className="rounded-xl border border-border-default bg-surface-raised overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-surface border-b border-border-default">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-muted w-8">{execLabel}</span>
          <span className="text-xs text-text-secondary font-medium">{typeLabel}</span>

          {/* Run button (code and SQL cells only) */}
          {cell.cell_type !== 'markdown' && <button
            onClick={() => executeCell(cell.id)}
            disabled={cell.running}
            className="p-1 rounded text-text-icon hover:text-blue-500 hover:bg-surface-secondary transition-colors disabled:opacity-50"
            title="Run cell (Shift+Enter)"
          >
            {cell.running ? (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>}
        </div>

        <CellToolbar cellId={cell.id} cellType={cell.cell_type} />
      </div>

      {/* Editor area */}
      {isMarkdown && !editing ? (
        <div
          className="px-4 py-3 cursor-text text-sm text-text-primary leading-relaxed min-h-[40px]"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{
            __html: cell.source ? renderMarkdown(cell.source) : '<span class="text-text-muted italic">Click to edit markdown...</span>',
          }}
        />
      ) : (
        <div
          ref={containerRef}
          onBlur={() => {
            if (isMarkdown) setEditing(false)
          }}
        />
      )}

      {/* Output */}
      <CellOutput outputs={cell.outputs} />

      {/* SQL → DataFrame variable hint */}
      {cell.dfVar && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border-default bg-surface text-xs">
          <span className="text-text-muted">Result saved as</span>
          <code className="font-mono font-medium text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
            {cell.dfVar}
          </code>
          <div className="relative">
            <span
              className="text-text-muted cursor-help border-b border-dotted border-text-muted"
              onMouseEnter={() => setShowDfHint(true)}
              onMouseLeave={() => setShowDfHint(false)}
            >
              How to use?
            </span>
            {showDfHint && (
              <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-border-default bg-surface-raised shadow-lg p-3 z-50">
                <p className="text-xs text-text-primary font-medium mb-2">
                  Use <code className="font-mono text-blue-500">{cell.dfVar}</code> in a Python cell to access this result as a pandas DataFrame.
                </p>
                <div className="space-y-1">
                  <code className="block text-[11px] font-mono text-text-secondary">{cell.dfVar}.head()</code>
                  <code className="block text-[11px] font-mono text-text-secondary">{cell.dfVar}.describe()</code>
                  <code className="block text-[11px] font-mono text-text-secondary">{cell.dfVar}["column"].value_counts()</code>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline chart preview */}
      {cell.chartId && <InlineChartPreview chartId={cell.chartId} />}
    </div>
  )
}
