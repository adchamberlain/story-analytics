import { useEditorStore } from '../../stores/editorStore'
import { ChartTypeSelector } from './ChartTypeSelector'
import { PaletteSelector } from './PaletteSelector'
import { ColumnDropdown } from './ColumnDropdown'
import type { ChartType } from '../../types/chart'
import type { PaletteKey } from '../../themes/datawrapper'

export function Toolbox() {
  const config = useEditorStore((s) => s.config)
  const columns = useEditorStore((s) => s.columns)
  const updateConfig = useEditorStore((s) => s.updateConfig)

  const isBar = config.chartType === 'BarChart'
  const hasSeriesOption = ['BarChart', 'LineChart', 'AreaChart', 'ScatterPlot'].includes(config.chartType)

  return (
    <div className="p-4 space-y-5">
      {/* Chart Type */}
      <Section title="Chart Type">
        <ChartTypeSelector
          value={config.chartType}
          onChange={(chartType: ChartType) => updateConfig({ chartType })}
        />
      </Section>

      {/* Column Mapping */}
      <Section title="Data">
        <div className="space-y-2">
          <ColumnDropdown
            label="X Axis"
            value={config.x}
            columns={columns}
            onChange={(x) => updateConfig({ x })}
          />
          {config.chartType !== 'Histogram' && (
            <ColumnDropdown
              label="Y Axis"
              value={config.y}
              columns={columns}
              onChange={(y) => updateConfig({ y })}
            />
          )}
          {hasSeriesOption && (
            <ColumnDropdown
              label="Series (color)"
              value={config.series}
              columns={columns}
              allowNone
              onChange={(series) => updateConfig({ series })}
            />
          )}
        </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-blue-400"
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
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}
