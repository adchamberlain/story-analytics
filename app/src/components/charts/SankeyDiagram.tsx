/**
 * Sankey diagram component using Plotly.
 * Shows flow between categories.
 */

import { PlotlyChart } from './PlotlyChart'
import type { ChartConfig } from '../../types/chart'
import type { Data, Layout } from 'plotly.js'

interface SankeyDiagramProps {
  data: Record<string, unknown>[]
  config: ChartConfig
}

export function SankeyDiagram({ data, config }: SankeyDiagramProps) {
  const sourceColumn = config.extraProps?.source as string || config.x
  const targetColumn = config.extraProps?.target as string || (Array.isArray(config.y) ? config.y[0] : config.y)
  const valueColumn = config.value || config.extraProps?.value as string

  if (!sourceColumn || !targetColumn || !valueColumn) {
    return <div className="error-message">Missing source, target, or value column configuration</div>
  }

  // Build node list (unique sources and targets)
  const allNodes = new Set<string>()
  for (const row of data) {
    allNodes.add(String(row[sourceColumn]))
    allNodes.add(String(row[targetColumn]))
  }
  const nodeList = Array.from(allNodes)
  const nodeIndexMap = new Map(nodeList.map((node, i) => [node, i]))

  // Build links
  const sources: number[] = []
  const targets: number[] = []
  const values: number[] = []
  const linkLabels: string[] = []

  for (const row of data) {
    const source = String(row[sourceColumn])
    const target = String(row[targetColumn])
    const value = Number(row[valueColumn]) || 0

    sources.push(nodeIndexMap.get(source)!)
    targets.push(nodeIndexMap.get(target)!)
    values.push(value)
    linkLabels.push(`${source} → ${target}: ${value}`)
  }

  // Generate colors for nodes
  const nodeColors = nodeList.map((_, i) => {
    const hue = (i * 137.5) % 360  // Golden angle for color distribution
    return `hsla(${hue}, 70%, 60%, 0.8)`
  })

  const trace: Data = {
    type: 'sankey',
    orientation: 'h',
    node: {
      pad: 15,
      thickness: 20,
      line: {
        color: 'white',
        width: 1,
      },
      label: nodeList,
      color: nodeColors,
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      label: linkLabels,
      color: sources.map(i => nodeColors[i].replace('0.8', '0.3')),
    },
  }

  const layout: Partial<Layout> = {
    title: config.title ? { text: config.title } : undefined,
    font: {
      family: 'var(--font-brand)',
      size: 12,
    },
  }

  return <PlotlyChart data={[trace]} layout={layout} />
}
