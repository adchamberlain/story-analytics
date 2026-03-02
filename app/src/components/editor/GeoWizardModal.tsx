import { useState, useRef } from 'react'

export const GEO_TYPES = ['state', 'country', 'zip', 'fips', 'city', 'address', 'lat_lon'] as const
export type GeoType = typeof GEO_TYPES[number]

const GEO_TYPE_LABELS: Record<GeoType, string> = {
  state: 'US State (name or abbreviation)',
  country: 'Country name or ISO code',
  zip: 'US Zip / Postal code',
  fips: 'US FIPS code',
  city: 'City name',
  address: 'Full address',
  lat_lon: 'Already Lat/Lon — skip geocoding',
}

export interface DetectedColumn {
  name: string
  inferred_type: GeoType
  confidence: number
  samples: string[]
}

export interface PreviewRow {
  value: string
  lat: number | null
  lon: number | null
  matched: boolean
}

interface WizardState {
  step: 1 | 2 | 3
  selectedColumn: string
  selectedType: GeoType
  previewResults: PreviewRow[]
  previewMatched: number
  previewTotal: number
  jobId: string | null
  jobResolved: number
  jobTotal: number
  error: string | null
  loading: boolean
}

interface Props {
  sourceId: string
  detectedColumns: DetectedColumn[]
  onComplete: () => void
  onSkip: () => void
}

export function GeoWizardModal({ sourceId, detectedColumns, onComplete, onSkip }: Props) {
  const primary = detectedColumns[0]
  const [state, setState] = useState<WizardState>({
    step: 1,
    selectedColumn: primary?.name ?? '',
    selectedType: primary?.inferred_type ?? 'city',
    previewResults: [],
    previewMatched: 0,
    previewTotal: 0,
    jobId: null,
    jobResolved: 0,
    jobTotal: 0,
    error: null,
    loading: false,
  })

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const update = (patch: Partial<WizardState>) => setState(s => ({ ...s, ...patch }))

  const handlePreview = async () => {
    update({ error: null, loading: true })
    try {
      const res = await fetch(`/api/data/sources/${sourceId}/geocode-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: state.selectedColumn, geo_type: state.selectedType }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Preview failed')
      const data = await res.json()
      update({
        step: 2,
        previewResults: data.results,
        previewMatched: data.matched,
        previewTotal: data.total,
        loading: false,
      })
    } catch (e) {
      update({ error: e instanceof Error ? e.message : 'Preview failed', loading: false })
    }
  }

  const handleApplyFull = async () => {
    // If user says columns are already lat/lon, no geocoding needed
    if (state.selectedType === 'lat_lon') {
      onComplete()
      return
    }
    update({ step: 3, error: null })
    try {
      const res = await fetch(`/api/data/sources/${sourceId}/geocode-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: state.selectedColumn, geo_type: state.selectedType }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to start geocoding')
      const { job_id } = await res.json()
      update({ jobId: job_id })
      pollJob(job_id)
    } catch (e) {
      update({ error: e instanceof Error ? e.message : 'Failed to start geocoding', step: 2 })
    }
  }

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/data/sources/${sourceId}/geocode-status/${jobId}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        update({ jobResolved: data.resolved, jobTotal: data.total })
        if (data.status === 'complete') {
          clearInterval(interval)
          pollIntervalRef.current = null
          onComplete()
        }
        if (data.status === 'failed') {
          clearInterval(interval)
          pollIntervalRef.current = null
          update({ error: data.error ?? 'Geocoding failed', step: 2 })
        }
      } catch {
        // network error during poll — interval will retry
      }
    }, 2000)
    pollIntervalRef.current = interval
  }

  const matchPct = state.previewTotal > 0 ? state.previewMatched / state.previewTotal : 0
  const matchColor = matchPct >= 0.8 ? 'text-green-400' : matchPct >= 0.5 ? 'text-amber-400' : 'text-red-400'
  const progressPct = state.jobTotal > 0 ? (state.jobResolved / state.jobTotal) * 100 : 5

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border-default rounded-xl shadow-2xl w-full max-w-lg mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Set up location data</h2>
            <p className="text-xs text-text-secondary mt-0.5">Step {state.step} of 3</p>
          </div>
          <button
            onClick={() => {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
              onSkip()
            }}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            Skip
          </button>
        </div>

        {/* Step 1: Column Mapping */}
        {state.step === 1 && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-text-secondary">
              We detected a possible location column. Confirm the column and type so we can resolve coordinates.
            </p>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Location column</label>
              <select
                value={state.selectedColumn}
                onChange={e => {
                  const col = detectedColumns.find(c => c.name === e.target.value)
                  update({
                    selectedColumn: e.target.value,
                    selectedType: col?.inferred_type ?? state.selectedType,
                  })
                }}
                className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
              >
                {detectedColumns.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              {(() => {
                const selectedColData = detectedColumns.find(c => c.name === state.selectedColumn)
                return selectedColData?.samples.length ? (
                  <p className="text-[10px] text-text-muted mt-1">
                    Sample values: {selectedColData.samples.slice(0, 3).join(', ')}
                  </p>
                ) : null
              })()}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Location type</label>
              <select
                value={state.selectedType}
                onChange={e => update({ selectedType: e.target.value as GeoType })}
                className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
              >
                {GEO_TYPES.map(t => (
                  <option key={t} value={t}>{GEO_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            {state.error && <p className="text-xs text-red-400">{state.error}</p>}
          </div>
        )}

        {/* Step 2: Preview */}
        {state.step === 2 && (
          <div className="px-6 py-5 space-y-3">
            <div className={`text-sm font-medium ${matchColor}`}>
              {state.previewMatched} / {state.previewTotal} values resolved
            </div>
            <div className="max-h-52 overflow-y-auto rounded-md border border-border-default">
              <table className="w-full text-xs">
                <thead className="bg-surface-secondary sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-text-secondary font-medium">Value</th>
                    <th className="px-3 py-2 text-left text-text-secondary font-medium">Lat</th>
                    <th className="px-3 py-2 text-left text-text-secondary font-medium">Lon</th>
                    <th className="px-3 py-2 text-left text-text-secondary font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.previewResults.map((r, i) => (
                    <tr key={i} className={r.matched ? '' : 'bg-amber-500/10'}>
                      <td className="px-3 py-1.5 text-text-primary">{r.value}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{r.lat != null ? r.lat.toFixed(4) : '—'}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{r.lon != null ? r.lon.toFixed(4) : '—'}</td>
                      <td className="px-3 py-1.5">
                        {r.matched
                          ? <span className="text-green-400">✓</span>
                          : <span className="text-amber-400">Not recognized</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {state.previewMatched === 0 && (
              <p className="text-xs text-red-400">No values resolved. Try changing the location type.</p>
            )}
          </div>
        )}

        {/* Step 3: Applying */}
        {state.step === 3 && (
          <div className="px-6 py-8 space-y-4 text-center">
            {state.error ? (
              <p className="text-xs text-red-400">{state.error}</p>
            ) : (
              <>
                <p className="text-sm text-text-secondary">
                  {state.jobTotal > 0
                    ? `Resolved ${state.jobResolved} / ${state.jobTotal} unique values…`
                    : 'Starting geocoding…'}
                </p>
                <div className="w-full bg-surface-secondary rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-muted">_lat and _lon columns will be added to your dataset</p>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-border-default">
          <button
            onClick={() => {
              if (state.step === 2) update({ step: 1 })
              else if (state.step === 3) {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current)
                  pollIntervalRef.current = null
                }
                update({ step: 2, error: null })
              }
              else onSkip()
            }}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            {state.step === 1 ? 'Skip' : '← Back'}
          </button>

          {state.step === 1 && (
            <button
              onClick={handlePreview}
              disabled={!state.selectedColumn || state.loading}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md"
            >
              {state.loading ? 'Loading…' : 'Preview →'}
            </button>
          )}
          {state.step === 2 && (
            <button
              onClick={handleApplyFull}
              disabled={state.selectedType !== 'lat_lon' && state.previewMatched === 0}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md"
            >
              {state.selectedType === 'lat_lon' ? 'Continue →' : 'Apply to full dataset →'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
