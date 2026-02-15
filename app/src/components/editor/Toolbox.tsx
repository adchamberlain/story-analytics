import { useEditorStore } from '../../stores/editorStore'
import { ChartTypeSelector } from './ChartTypeSelector'
import { PaletteSelector } from './PaletteSelector'
import { ColumnDropdown } from './ColumnDropdown'
import type { ChartType } from '../../types/chart'
import type { PaletteKey } from '../../themes/datawrapper'
import type { AggregationType, DataMode } from '../../stores/editorStore'

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
  const data = useEditorStore((s) => s.data)

  const isBar = config.chartType === 'BarChart'
  const hasSeriesOption = ['BarChart', 'LineChart', 'AreaChart', 'ScatterPlot'].includes(config.chartType)
  const isSqlMode = config.dataMode === 'sql'
  const sqlHasResults = isSqlMode && data.length > 0

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
            {/* Table Reference */}
            {availableTables.length > 0 && (
              <div className="bg-surface-secondary border border-border-default rounded-md p-2">
                <p className="text-[10px] font-medium text-text-icon uppercase tracking-wider mb-1">Tables</p>
                {availableTables.map((t) => (
                  <div key={t.source_id} className="flex items-baseline gap-2 py-0.5">
                    <code className="text-xs font-mono text-text-primary">{t.table_name}</code>
                    <span className="text-[10px] text-text-icon truncate">({t.display_name})</span>
                  </div>
                ))}
              </div>
            )}

            {/* SQL Textarea */}
            <textarea
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  executeCustomSql()
                }
              }}
              placeholder="SELECT * FROM src_..."
              rows={6}
              className="w-full px-2 py-1.5 text-xs font-mono border border-border-default rounded-md resize-y focus:outline-none focus:border-blue-400 bg-surface text-text-primary"
            />

            {/* Run Button */}
            <button
              onClick={executeCustomSql}
              disabled={!customSql.trim() || sqlExecuting}
              className="w-full px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sqlExecuting ? 'Running...' : 'Run Query'}
            </button>

            {/* Error Display */}
            {sqlError && (
              <div className="bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                <p className="text-xs text-red-700 font-mono whitespace-pre-wrap">{sqlError}</p>
              </div>
            )}

            {/* Column Mapping (after successful execution) */}
            {sqlHasResults && (
              <div className="space-y-2 pt-2 border-t border-border-default">
                <p className="text-[10px] font-medium text-text-icon uppercase tracking-wider">Map result columns</p>
                <ColumnDropdown
                  label="X Axis"
                  value={config.x}
                  columns={columns}
                  columnTypes={columnTypes}
                  onChange={(x) => updateConfig({ x })}
                />
                {config.chartType !== 'Histogram' && (
                  <ColumnDropdown
                    label="Y Axis"
                    value={config.y}
                    columns={columns}
                    columnTypes={columnTypes}
                    onChange={(y) => updateConfig({ y })}
                  />
                )}
                {hasSeriesOption && (
                  <ColumnDropdown
                    label="Series (color)"
                    value={config.series}
                    columns={columns}
                    columnTypes={columnTypes}
                    allowNone
                    onChange={(series) => updateConfig({ series })}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            <ColumnDropdown
              label="X Axis"
              value={config.x}
              columns={columns}
              columnTypes={columnTypes}
              onChange={(x) => updateConfig({ x })}
            />
            {config.chartType !== 'Histogram' && (
              <ColumnDropdown
                label="Y Axis"
                value={config.y}
                columns={columns}
                columnTypes={columnTypes}
                onChange={(y) => updateConfig({ y })}
              />
            )}
            {hasSeriesOption && (
              <ColumnDropdown
                label="Series (color)"
                value={config.series}
                columns={columns}
                columnTypes={columnTypes}
                allowNone
                onChange={(series) => updateConfig({ series })}
              />
            )}
            {config.chartType !== 'Histogram' && config.y && (
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
                  <option value="count">Count</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                </select>
              </div>
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
          <Toggle
            label="Legend"
            checked={config.showLegend}
            onChange={(showLegend) => updateConfig({ showLegend })}
          />
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

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-border-default rounded-md bg-surface text-text-primary focus:outline-none focus:border-blue-400"
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
