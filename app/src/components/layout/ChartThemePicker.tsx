import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CHART_THEMES } from '../../themes/chartThemes'
import { useChartThemeStore } from '../../stores/chartThemeStore'

const themes = Object.values(CHART_THEMES)

export function ChartThemePicker() {
  const [open, setOpen] = useState(false)
  const { themeId, setChartTheme } = useChartThemeStore()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg transition-colors text-text-icon hover:text-text-icon-hover hover:bg-surface-secondary"
        aria-label="Chart theme"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 z-50 bg-surface-raised border border-border-default rounded-xl shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border-default">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Chart Theme</span>
            </div>

            <div className="py-1 max-h-80 overflow-y-auto">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setChartTheme(t.id); setOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-secondary ${
                    t.id === themeId ? 'bg-surface-inset' : ''
                  }`}
                >
                  <div className="flex items-center gap-0.5 shrink-0">
                    {t.palette.colors.slice(0, 5).map((color, i) => (
                      <span
                        key={i}
                        className="inline-block rounded-full"
                        style={{ width: 14, height: 14, backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-text-primary truncate">{t.name}</span>
                  {t.id === themeId && (
                    <svg className="h-4 w-4 ml-auto shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-border-default px-3 py-2">
              <Link
                to="/settings/themes"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
              >
                Manage Themes
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
