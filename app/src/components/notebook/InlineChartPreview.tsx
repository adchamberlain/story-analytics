import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../../utils/authFetch'

interface Props {
  chartId: string
}

export function InlineChartPreview({ chartId }: Props) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')

  useEffect(() => {
    authFetch(`/api/v2/charts/${chartId}`)
      .then((r: Response) => r.json())
      .then((data: { title?: string }) => setTitle(data.title || 'Chart'))
      .catch(() => {})
  }, [chartId])

  return (
    <div
      onClick={() => navigate(`/editor/${chartId}`)}
      className="mt-2 mx-4 mb-3 cursor-pointer rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 hover:border-blue-400 transition-colors"
    >
      <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <span className="font-medium">{title}</span>
        <span className="text-xs text-blue-400">Click to edit →</span>
      </div>
    </div>
  )
}
