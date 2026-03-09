import { useRef, useEffect, useState, useCallback } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { defaultKeymap } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { useThemeStore } from '../../stores/themeStore'
import { useNotebookStore } from '../../stores/notebookStore'
import type { NotebookCell as NotebookCellType } from '../../stores/notebookStore'
import { CellOutput } from './CellOutput'
import { CellToolbar } from './CellToolbar'

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
}

export function NotebookCell({ cell }: NotebookCellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const resolved = useThemeStore((s) => s.resolved)
  const { updateCellSource, executeCell } = useNotebookStore()
  const executeCellRef = useRef(executeCell)
  executeCellRef.current = executeCell

  const [editing, setEditing] = useState(cell.cell_type !== 'markdown')

  // For markdown cells: show rendered view by default, click to edit
  const isMarkdown = cell.cell_type === 'markdown'

  const onSourceChange = useCallback(
    (value: string) => {
      updateCellSource(cell.id, value)
    },
    [cell.id, updateCellSource],
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
  }, [cell.cell_type, resolved, editing])

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

          {/* Run button */}
          <button
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
          </button>
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
    </div>
  )
}
