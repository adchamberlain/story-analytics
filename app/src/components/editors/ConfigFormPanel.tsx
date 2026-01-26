/**
 * Form panel that renders appropriate config controls based on chart type.
 */

import type { ChartConfig, ChartType } from '../../types/chart'
import { ToggleOption, ColorPicker, TextInput, SelectInput } from './controls'

interface ConfigFormPanelProps {
  chartType: ChartType
  config: Partial<ChartConfig>
  onChange: (config: Partial<ChartConfig>) => void
}

// Number input component
function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--color-gray-200)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {label}
      </label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const val = e.target.value
          onChange(val === '' ? undefined : Number(val))
        }}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        style={{
          width: '100%',
          padding: 'var(--space-2)',
          fontSize: 'var(--text-sm)',
          backgroundColor: 'var(--color-gray-700)',
          border: '1px solid var(--color-gray-600)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-gray-100)',
        }}
      />
    </div>
  )
}

// Section header component
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        color: 'var(--color-gray-400)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 'var(--space-2)',
        marginTop: 'var(--space-4)',
      }}
    >
      {children}
    </div>
  )
}

export function ConfigFormPanel({ chartType, config, onChange }: ConfigFormPanelProps) {
  // Helper to update a single field
  const updateField = (field: string, value: unknown) => {
    onChange({ ...config, [field]: value })
  }

  // Determine which option groups to show based on chart type
  const showLineOptions = chartType === 'LineChart' || chartType === 'AreaChart' || chartType === 'ScatterPlot'
  const showBarOptions = chartType === 'BarChart' || chartType === 'Histogram'
  const showStackOption = chartType === 'BarChart' || chartType === 'LineChart' || chartType === 'AreaChart'
  const showBigValueOptions = chartType === 'BigValue'
  const showColorOptions = chartType !== 'DataTable'

  return (
    <div>
      {/* ===== LABELS SECTION ===== */}
      <SectionHeader>Labels</SectionHeader>

      <TextInput
        label="Chart Title"
        value={config.title || ''}
        onChange={(value) => updateField('title', value)}
        placeholder="Enter chart title"
      />

      <TextInput
        label="X-Axis Title"
        value={config.xAxisTitle || ''}
        onChange={(value) => updateField('xAxisTitle', value)}
        placeholder="e.g., Date, Category"
      />

      <TextInput
        label="Y-Axis Title"
        value={config.yAxisTitle || ''}
        onChange={(value) => updateField('yAxisTitle', value)}
        placeholder="e.g., Revenue, Count"
      />

      {/* ===== COLORS SECTION ===== */}
      {showColorOptions && (
        <>
          <SectionHeader>Colors</SectionHeader>

          <ColorPicker
            label="Primary Color"
            value={config.color || '#3b82f6'}
            onChange={(value) => updateField('color', value)}
          />

          {(chartType === 'AreaChart' || chartType === 'LineChart') && (
            <ColorPicker
              label="Fill Color"
              value={config.fillColor || '#3b82f6'}
              onChange={(value) => updateField('fillColor', value)}
            />
          )}

          <ColorPicker
            label="Background Color"
            value={config.backgroundColor || ''}
            onChange={(value) => updateField('backgroundColor', value || undefined)}
          />

          <ColorPicker
            label="Grid Color"
            value={config.gridColor || ''}
            onChange={(value) => updateField('gridColor', value || undefined)}
          />
        </>
      )}

      {/* ===== TYPOGRAPHY SECTION ===== */}
      <SectionHeader>Typography</SectionHeader>

      <NumberInput
        label="Title Font Size"
        value={config.titleFontSize}
        onChange={(value) => updateField('titleFontSize', value)}
        placeholder="e.g., 16"
        min={8}
        max={48}
      />

      <NumberInput
        label="Legend Font Size"
        value={config.legendFontSize}
        onChange={(value) => updateField('legendFontSize', value)}
        placeholder="e.g., 12"
        min={8}
        max={24}
      />

      <NumberInput
        label="Axis Font Size"
        value={config.axisFontSize}
        onChange={(value) => updateField('axisFontSize', value)}
        placeholder="e.g., 11"
        min={8}
        max={24}
      />

      {/* ===== DISPLAY OPTIONS SECTION ===== */}
      <SectionHeader>Display Options</SectionHeader>

      <ToggleOption
        label="Show Legend"
        description="Display the chart legend"
        checked={config.showLegend !== false}
        onChange={(value) => updateField('showLegend', value)}
      />

      <ToggleOption
        label="Show Grid Lines"
        description="Display background grid lines"
        checked={config.showGrid !== false}
        onChange={(value) => updateField('showGrid', value)}
      />

      <ToggleOption
        label="Show Data Values"
        description="Display values on data points"
        checked={config.showValues || false}
        onChange={(value) => updateField('showValues', value)}
      />

      {/* ===== AXIS OPTIONS SECTION ===== */}
      <SectionHeader>Axis Options</SectionHeader>

      <NumberInput
        label="Tick Label Angle"
        value={config.tickAngle}
        onChange={(value) => updateField('tickAngle', value)}
        placeholder="e.g., -45"
        min={-90}
        max={90}
      />

      <NumberInput
        label="Y-Axis Minimum"
        value={config.yAxisMin}
        onChange={(value) => updateField('yAxisMin', value)}
        placeholder="Auto"
        step={0.1}
      />

      <NumberInput
        label="Y-Axis Maximum"
        value={config.yAxisMax}
        onChange={(value) => updateField('yAxisMax', value)}
        placeholder="Auto"
        step={0.1}
      />

      {/* ===== BAR CHART OPTIONS ===== */}
      {showBarOptions && (
        <>
          <SectionHeader>Bar Options</SectionHeader>

          {chartType === 'BarChart' && (
            <ToggleOption
              label="Horizontal Bars"
              description="Display bars horizontally instead of vertically"
              checked={config.horizontal || false}
              onChange={(value) => updateField('horizontal', value)}
            />
          )}

          {showStackOption && (
            <ToggleOption
              label="Stacked"
              description="Stack multiple series on top of each other"
              checked={config.stacked || false}
              onChange={(value) => updateField('stacked', value)}
            />
          )}

          {chartType === 'BarChart' && (
            <SelectInput
              label="Sort Order"
              value={typeof config.sort === 'string' ? config.sort : config.sort ? 'asc' : 'none'}
              onChange={(value) => updateField('sort', value === 'none' ? false : value)}
              options={[
                { value: 'none', label: 'None (original order)' },
                { value: 'asc', label: 'Ascending (smallest first)' },
                { value: 'desc', label: 'Descending (largest first)' },
              ]}
            />
          )}

          <NumberInput
            label="Bar Gap"
            value={config.barGap}
            onChange={(value) => updateField('barGap', value)}
            placeholder="e.g., 0.2"
            min={0}
            max={1}
            step={0.1}
          />

          {chartType === 'BarChart' && (
            <NumberInput
              label="Bar Group Gap"
              value={config.barGroupGap}
              onChange={(value) => updateField('barGroupGap', value)}
              placeholder="e.g., 0.1"
              min={0}
              max={1}
              step={0.1}
            />
          )}
        </>
      )}

      {/* ===== LINE/AREA CHART OPTIONS ===== */}
      {showLineOptions && (
        <>
          <SectionHeader>Line Options</SectionHeader>

          {(chartType === 'LineChart' || chartType === 'AreaChart') && showStackOption && (
            <ToggleOption
              label="Stacked"
              description="Stack multiple series cumulatively"
              checked={config.stacked || false}
              onChange={(value) => updateField('stacked', value)}
            />
          )}

          <NumberInput
            label="Line Width"
            value={config.lineWidth}
            onChange={(value) => updateField('lineWidth', value)}
            placeholder="e.g., 2"
            min={1}
            max={10}
          />

          <NumberInput
            label="Marker Size"
            value={config.markerSize}
            onChange={(value) => updateField('markerSize', value)}
            placeholder="e.g., 6"
            min={0}
            max={20}
          />
        </>
      )}

      {/* ===== BIG VALUE (KPI) OPTIONS ===== */}
      {showBigValueOptions && (
        <>
          <SectionHeader>KPI Options</SectionHeader>

          <SelectInput
            label="Value Format"
            value={config.valueFormat || 'number'}
            onChange={(value) => updateField('valueFormat', value as 'currency' | 'percent' | 'number')}
            options={[
              { value: 'number', label: 'Number (1,234)' },
              { value: 'currency', label: 'Currency ($1,234)' },
              { value: 'percent', label: 'Percent (12.3%)' },
            ]}
          />

          <ToggleOption
            label="Positive is Good"
            description="Show positive changes in green (uncheck for metrics where lower is better)"
            checked={config.positiveIsGood !== false}
            onChange={(value) => updateField('positiveIsGood', value)}
          />

          <ToggleOption
            label="Show Trend Arrow"
            description="Display trend indicator arrow"
            checked={config.showTrend !== false}
            onChange={(value) => updateField('showTrend', value)}
          />

          <SelectInput
            label="Sparkline Type"
            value={config.sparklineType || 'line'}
            onChange={(value) => updateField('sparklineType', value as 'line' | 'bar')}
            options={[
              { value: 'line', label: 'Line' },
              { value: 'bar', label: 'Bar' },
            ]}
          />
        </>
      )}
    </div>
  )
}
