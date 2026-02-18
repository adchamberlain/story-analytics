import { useState, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { ChartTypeSelector } from './ChartTypeSelector'
import { PaletteSelector } from './PaletteSelector'
import { ColumnDropdown } from './ColumnDropdown'
import { MultiColumnSelect } from './MultiColumnSelect'
import { AnnotationEditor } from './AnnotationEditor'
import type { ChartType } from '../../types/chart'
import type { PaletteKey } from '../../themes/plotTheme'
import type { AggregationType, TimeGrain, DataMode, EditorConfig, TableInfoItem } from '../../stores/editorStore'

function isDateColumn(type: string | undefined): boolean {
  if (!type) return false
  const t = type.toUpperCase()
  return t === 'DATE' || t.startsWith('TIMESTAMP')
}

export function Toolbox() {
  const config = useEditorStore((s) => s.config)
  const columns = useEditorStore((s) => s.columns)
  const columnTypes = useEditorStore((s) => s.columnTypes)
  const updateConfig = useEditorStore((s) => s.updateConfig)
  const setDataMode = useEditorStore((s) => s.setDataMode)
  const customSql = useEditorStore((s) => s.customSql)
  const setCustomSql = useEditorStore((s) => s.setCustomSql)
  const executeCustomSql = useEditorStore((s) => s.executeCustomSql)
  const sqlError = useEditorStore((s) => s.sqlError)
  const sqlExecuting = useEditorStore((s) => s.sqlExecuting)
  const availableTables = useEditorStore((s) => s.availableTables)
  const sourceId = useEditorStore((s) => s.sourceId)
  const data = useEditorStore((s) => s.data)

  const [sqlSuccess, setSqlSuccess] = useState<string | null>(null)
  const sqlSuccessTimer = useRef<ReturnType<typeof setTimeout>>()

  const handleRunQuery = async () => {
    setSqlSuccess(null)
    clearTimeout(sqlSuccessTimer.current)
    await executeCustomSql()
    // Check store for results after execution
    const { data: rows, sqlError: err } = useEditorStore.getState()
    if (!err && rows.length >= 0) {
      const msg = `${rows.length.toLocaleString()} row${rows.length !== 1 ? 's' : ''} returned`
      setSqlSuccess(msg)
      sqlSuccessTimer.current = setTimeout(() => setSqlSuccess(null), 4000)
    }
  }

  const isBar = config.chartType === 'BarChart'
  const isBigValue = config.chartType === 'BigValue'
  const hasSeriesOption = ['BarChart', 'LineChart', 'AreaChart', 'ScatterPlot'].includes(config.chartType)
  const isSqlMode = config.dataMode === 'sql'
  const sqlHasResults = isSqlMode && data.length > 0
  // Derive actual result columns from data keys — the store's `columns` may still
  // hold source-table columns when buildQuery produced an UNPIVOT result.
  const sqlResultColumns = sqlHasResults ? Object.keys(data[0]) : columns
  const isMultiY = Array.isArray(config.y) && config.y.length > 1
  const hasY = Array.isArray(config.y) ? config.y.length > 0 : !!config.y

  return (
    <div className="p-4 space-y-5">
      {/* Chart Type */}
      <Section title="Chart Type">
        <ChartTypeSelector
          value={config.chartType}
          onChange={(chartType: ChartType) => updateConfig({ chartType })}
        />
      </Section>

      {/* Data Section with Mode Toggle */}
      <Section title="Data">
        {/* Mode Toggle */}
        <ModeToggle value={config.dataMode} onChange={setDataMode} />

        {isSqlMode ? (
          <div className="space-y-3 mt-3">
            {/* Current table hint */}
            <SqlTableHint sourceId={sourceId} availableTables={availableTables} />

            {/* SQL Textarea */}
            <textarea
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  handleRunQuery()
                }
              }}
              placeholder="SELECT * FROM src_..."
              rows={6}
              className="w-full px-2 py-1.5 text-xs font-mono border border-border-default rounded-md resize-y focus:outline-none focus:border-blue-400 bg-surface text-text-primary"
            />

            {/* Run Button */}
            <button
              onClick={handleRunQuery}
              disabled={!customSql.trim() || sqlExecuting}
              className="w-full px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sqlExecuting ? 'Running...' : 'Run Query'}
            </button>

            {/* Success Flash */}
            {sqlSuccess && !sqlError && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5">
                <p className="text-xs text-emerald-400">{sqlSuccess}</p>
              </div>
            )}

            {/* Error Display */}
            {sqlError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
                <p className="text-xs text-red-400 font-mono whitespace-pre-wrap">{sqlError}</p>
              </div>
            )}

            {/* Results Preview */}
            {sqlHasResults && (
              <SqlResultsTable data={data} columns={sqlResultColumns} />
            )}

            {/* Column Mapping (after successful execution) */}
            {sqlHasResults && (
              <div className="space-y-2 pt-2 border-t border-border-default">
                <p className="text-[10px] font-medium text-text-icon uppercase tracking-wider">Map result columns</p>
                {isBigValue ? (
                  <BigValueColumnMapping columns={sqlResultColumns} columnTypes={columnTypes} config={config} updateConfig={updateConfig} />
                ) : (
                  <>
                    <ColumnDropdown
                      label="X Axis"
                      value={config.x}
                      columns={sqlResultColumns}
                      columnTypes={columnTypes}
                      onChange={(x) => updateConfig({ x })}
                    />
                    {config.chartType !== 'Histogram' && (
                      <ColumnDropdown
                        label="Y Axis"
                        value={Array.isArray(config.y) ? config.y[0] ?? null : config.y}
                        columns={sqlResultColumns}
                        columnTypes={columnTypes}
                        onChange={(y) => updateConfig({ y })}
                      />
                    )}
                    {hasSeriesOption && (
                      <ColumnDropdown
                        label="Series (color)"
                        value={config.series}
                        columns={sqlResultColumns}
                        columnTypes={columnTypes}
                        allowNone
                        onChange={(series) => updateConfig({ series })}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            {isBigValue ? (
              <BigValueColumnMapping columns={columns} columnTypes={columnTypes} config={config} updateConfig={updateConfig} />
            ) : (
              <>
                <ColumnDropdown
                  label="X Axis"
                  value={config.x}
                  columns={columns}
                  columnTypes={columnTypes}
                  onChange={(x) => updateConfig({ x })}
                />
                {config.chartType !== 'Histogram' && hasSeriesOption ? (
                  <MultiColumnSelect
                    label="Y Axis"
                    value={config.y}
                    columns={columns}
                    columnTypes={columnTypes}
                    onChange={(y) => updateConfig({ y })}
                  />
                ) : config.chartType !== 'Histogram' ? (
                  <ColumnDropdown
                    label="Y Axis"
                    value={Array.isArray(config.y) ? config.y[0] ?? null : config.y}
                    columns={columns}
                    columnTypes={columnTypes}
                    onChange={(y) => updateConfig({ y })}
                  />
                ) : null}
                {hasSeriesOption && !isMultiY && (
                  <ColumnDropdown
                    label="Series (color)"
                    value={config.series}
                    columns={columns}
                    columnTypes={columnTypes}
                    allowNone
                    onChange={(series) => updateConfig({ series })}
                  />
                )}
                {config.chartType !== 'Histogram' && hasY && (
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Aggregation</label>
                    <select
                      value={config.aggregation}
                      onChange={(e) => updateConfig({ aggregation: e.target.value as AggregationType })}
                      className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
                    >
                      <option value="none">None (raw)</option>
                      <option value="sum">Sum</option>
                      <option value="avg">Average</option>
                      <option value="median">Median</option>
                      <option value="count">Count</option>
                      <option value="min">Min</option>
                      <option value="max">Max</option>
                    </select>
                  </div>
                )}
                {config.aggregation !== 'none' && config.x && isDateColumn(columnTypes[config.x]) && (
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Time grain</label>
                    <select
                      value={config.timeGrain}
                      onChange={(e) => updateConfig({ timeGrain: e.target.value as TimeGrain })}
                      className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
                    >
                      <option value="none">As-is</option>
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                      <option value="quarter">Quarterly</option>
                      <option value="year">Yearly</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Section>

      {/* Text */}
      <Section title="Text">
        <div className="space-y-2">
          <TextInput
            label="Title"
            value={config.title}
            onChange={(title) => updateConfig({ title })}
          />
          <TextInput
            label="Subtitle"
            value={config.subtitle}
            onChange={(subtitle) => updateConfig({ subtitle })}
          />
          <TextInput
            label="Source"
            value={config.source}
            onChange={(source) => updateConfig({ source })}
          />
          {config.source && (
            <TextInput
              label="Source URL"
              value={config.sourceUrl}
              onChange={(sourceUrl) => updateConfig({ sourceUrl })}
              placeholder="https://..."
            />
          )}
        </div>
      </Section>

      {/* Palette */}
      <Section title="Colors">
        <PaletteSelector
          value={config.palette}
          onChange={(palette: PaletteKey) => updateConfig({ palette })}
        />
      </Section>

      {/* Toggles */}
      <Section title="Options">
        <div className="space-y-2">
          {isBar && (
            <Toggle
              label="Horizontal"
              checked={config.horizontal}
              onChange={(horizontal) => updateConfig({ horizontal })}
            />
          )}
          {isBar && (
            <Toggle
              label="Sort by value"
              checked={config.sort}
              onChange={(sort) => updateConfig({ sort })}
            />
          )}
          {isBar && config.series !== null && (
            <Toggle
              label="Stacked"
              checked={config.stacked}
              onChange={(stacked) => updateConfig({ stacked })}
            />
          )}
          <Toggle
            label="Grid lines"
            checked={config.showGrid}
            onChange={(showGrid) => updateConfig({ showGrid })}
          />
          {(config.series || isMultiY) && (
            <Toggle
              label="Legend"
              checked={config.showLegend}
              onChange={(showLegend) => updateConfig({ showLegend })}
            />
          )}
        </div>
      </Section>

      {/* Axis Labels */}
      <Section title="Axis Labels">
        <div className="space-y-2">
          <TextInput
            label="X Axis Label"
            value={config.xAxisTitle}
            onChange={(xAxisTitle) => updateConfig({ xAxisTitle })}
          />
          <TextInput
            label="Y Axis Label"
            value={config.yAxisTitle}
            onChange={(yAxisTitle) => updateConfig({ yAxisTitle })}
          />
        </div>
      </Section>

      {/* Annotations */}
      <CollapsibleSection
        title="Annotations"
        count={config.annotations.lines.length + config.annotations.texts.length + config.annotations.ranges.length}
      >
        <AnnotationEditor />
      </CollapsibleSection>
    </div>
  )
}

// ── Local helper components ────────────────────────────────────────────────

function ModeToggle({ value, onChange }: { value: DataMode; onChange: (mode: DataMode) => void }) {
  return (
    <div className="flex bg-surface-inset rounded-md p-0.5">
      {(['table', 'sql'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-colors ${
            value === mode
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-on-surface'
          }`}
        >
          {mode === 'table' ? 'Table' : 'SQL'}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-text-icon uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  )
}

function CollapsibleSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState((count ?? 0) > 0)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-text-icon transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <h4 className="text-xs font-semibold text-text-icon uppercase tracking-wider">{title}</h4>
        {(count ?? 0) > 0 && (
          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">{count}</span>
        )}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-400"
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border-strong text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-text-on-surface">{label}</span>
    </label>
  )
}

function SqlResultsTable({ data, columns }: { data: Record<string, unknown>[]; columns: string[] }) {
  const MAX_PREVIEW = 10
  const preview = data.slice(0, MAX_PREVIEW)
  const hasMore = data.length > MAX_PREVIEW

  return (
    <div className="border border-border-default rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface-secondary border-b border-border-default">
        <p className="text-[10px] font-medium text-text-icon uppercase tracking-wider">
          Results
        </p>
        <span className="text-[10px] text-text-muted">
          {data.length.toLocaleString()} row{data.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto max-h-[240px] overflow-y-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="bg-surface-secondary sticky top-0">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1 text-left font-semibold text-text-secondary whitespace-nowrap border-b border-border-default"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-b border-border-default last:border-b-0 hover:bg-surface-secondary/50">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-2 py-1 text-text-primary whitespace-nowrap max-w-[160px] truncate"
                    title={String(row[col] ?? '')}
                  >
                    {row[col] == null ? <span className="text-text-muted italic">null</span> : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="px-2 py-1 bg-surface-secondary border-t border-border-default">
          <p className="text-[10px] text-text-muted text-center">
            Showing {MAX_PREVIEW} of {data.length.toLocaleString()} rows
          </p>
        </div>
      )}
    </div>
  )
}

function SqlTableHint({ sourceId, availableTables }: { sourceId: string | null; availableTables: TableInfoItem[] }) {
  const [showAll, setShowAll] = useState(false)

  // Find the current chart's table
  const currentTable = sourceId
    ? availableTables.find((t) => t.source_id === sourceId)
    : null
  const tableName = currentTable?.table_name ?? (sourceId ? `src_${sourceId}` : null)

  const otherTables = availableTables.filter((t) => t.source_id !== sourceId)

  return (
    <div className="bg-surface-secondary border border-border-default rounded-md p-2">
      {tableName ? (
        <div>
          <p className="text-[10px] font-medium text-text-icon uppercase tracking-wider mb-1">Your table</p>
          <code className="text-xs font-mono text-blue-400 select-all">{tableName}</code>
          {currentTable && (
            <span className="text-[10px] text-text-icon ml-2">
              {currentTable.row_count.toLocaleString()} rows, {currentTable.column_count} cols
            </span>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-text-icon">No table loaded</p>
      )}
      {otherTables.length > 0 && (
        <div className="mt-1.5">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {showAll ? 'Hide' : 'Show'} {otherTables.length} other table{otherTables.length !== 1 ? 's' : ''}
          </button>
          {showAll && (
            <div className="mt-1 space-y-0.5">
              {otherTables.map((t) => (
                <div key={t.source_id} className="flex items-baseline gap-2">
                  <code className="text-[11px] font-mono text-text-secondary">{t.table_name}</code>
                  <span className="text-[10px] text-text-icon truncate">({t.display_name})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BigValueColumnMapping({
  columns,
  columnTypes,
  config,
  updateConfig,
}: {
  columns: string[]
  columnTypes: Record<string, string>
  config: EditorConfig
  updateConfig: (partial: Partial<EditorConfig>) => void
}) {
  const selectClass =
    'w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400'

  return (
    <div className="space-y-2">
      <ColumnDropdown
        label="Value column"
        value={config.value}
        columns={columns}
        columnTypes={columnTypes}
        onChange={(value) => updateConfig({ value })}
      />
      <ColumnDropdown
        label="Goal / comparison column"
        value={config.comparisonValue}
        columns={columns}
        columnTypes={columnTypes}
        allowNone
        onChange={(comparisonValue) => updateConfig({ comparisonValue })}
      />
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Comparison label</label>
        <input
          type="text"
          value={config.comparisonLabel}
          onChange={(e) => updateConfig({ comparisonLabel: e.target.value })}
          placeholder="e.g. vs Goal"
          className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Format</label>
        <select
          value={config.valueFormat}
          onChange={(e) => updateConfig({ valueFormat: e.target.value as EditorConfig['valueFormat'] })}
          className={selectClass}
        >
          <option value="">Auto</option>
          <option value="number">Number</option>
          <option value="currency">Currency ($)</option>
          <option value="percent">Percent (%)</option>
        </select>
      </div>
      <Toggle
        label="Positive is good"
        checked={config.positiveIsGood}
        onChange={(positiveIsGood) => updateConfig({ positiveIsGood })}
      />
    </div>
  )
}
