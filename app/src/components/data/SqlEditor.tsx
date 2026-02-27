import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion, CompletionContext } from '@codemirror/autocomplete'
import { searchKeymap } from '@codemirror/search'

export interface SqlEditorRef {
  getValue: () => string
  setValue: (value: string) => void
  insertAtCursor: (text: string) => void
}

interface SqlEditorProps {
  defaultValue?: string
  placeholder?: string
  schema?: Record<string, string[]> // { "schema.table": ["col1", "col2"] }
  onRun?: (sql: string) => void // Cmd+Enter callback
  onChange?: (value: string) => void
  className?: string
}

export const SqlEditor = forwardRef<SqlEditorRef, SqlEditorProps>(
  ({ defaultValue = '', placeholder = 'Write SQL...', schema, onRun, onChange, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    useImperativeHandle(ref, () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? '',
      setValue: (value: string) => {
        if (!viewRef.current) return
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: value },
        })
      },
      insertAtCursor: (text: string) => {
        if (!viewRef.current) return
        const pos = viewRef.current.state.selection.main.head
        viewRef.current.dispatch({ changes: { from: pos, insert: text } })
      },
    }))

    const schemaCompletion = useCallback(
      (context: CompletionContext) => {
        if (!schema) return null
        const word = context.matchBefore(/[\w.]*/)
        if (!word || (word.from === word.to && !context.explicit)) return null
        const options = []
        for (const [table, columns] of Object.entries(schema)) {
          options.push({ label: table, type: 'class' })
          for (const col of columns) {
            options.push({ label: col, type: 'property', detail: table })
          }
        }
        return { from: word.from, options }
      },
      [schema],
    )

    useEffect(() => {
      if (!containerRef.current) return

      const runKeymap = onRun
        ? keymap.of([
            {
              key: 'Mod-Enter',
              run: (view) => {
                onRun(view.state.doc.toString())
                return true
              },
            },
          ])
        : keymap.of([])

      const state = EditorState.create({
        doc: defaultValue,
        extensions: [
          keymap.of([...defaultKeymap, ...searchKeymap]),
          runKeymap,
          sql(),
          autocompletion({ override: schema ? [schemaCompletion] : undefined }),
          oneDark,
          cmPlaceholder(placeholder),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && onChange) {
              onChange(update.state.doc.toString())
            }
          }),
          EditorView.theme({
            '&': { fontSize: '13px', minHeight: '80px', maxHeight: '200px' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': { fontFamily: 'ui-monospace, monospace' },
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
    }, [schema])

    return <div ref={containerRef} className={className} />
  },
)

SqlEditor.displayName = 'SqlEditor'
