import type { DbAggregate, DbChartConfig, DbChartSeries, DbField, DbRecord } from '../../../../types/database-block'
import { formatCellValue } from './dbCellFormat'

export interface DatabaseChartRow {
  x: string
  y: number
  series: string
}

export function chartValueFieldIds(chart: DbChartConfig, fields: DbField[]): string[] {
  const requested = chart.series !== undefined
    ? chart.series.map(series => series.fieldId)
    : chart.yFields?.length ? chart.yFields : chart.yField ? [chart.yField] : []
  const numericIds = new Set(fields.filter(field => field.type === 'number').map(field => field.id))
  return [...new Set(requested.filter(fieldId => numericIds.has(fieldId)))]
}

export function chartSeriesForFields(chart: DbChartConfig, fields: DbField[]): DbChartSeries[] {
  const numericIds = new Set(fields.filter(field => field.type === 'number').map(field => field.id))
  const source = chart.series !== undefined
    ? chart.series
    : chartValueFieldIds(chart, fields).map(fieldId => ({ id: `legacy_${fieldId}`, fieldId }))
  const seen = new Set<string>()
  return source.filter(series => {
    if (!numericIds.has(series.fieldId) || seen.has(series.fieldId)) return false
    seen.add(series.fieldId)
    return true
  })
}

function aggregateValues(values: number[], kind: DbAggregate): number {
  if (!values.length) return 0
  switch (kind) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
    case 'count': return values.length
  }
}

export function buildDatabaseChartRows(
  records: DbRecord[],
  fields: DbField[],
  chart: DbChartConfig,
  t: (key: string) => string,
): DatabaseChartRow[] {
  const xField = fields.find(field => field.id === chart.xField)
  const valueFieldIds = chartValueFieldIds(chart, fields)
  const valueFields = valueFieldIds
    .map(fieldId => fields.find(field => field.id === fieldId))
    .filter((field): field is DbField => Boolean(field))
  const groups = new Map<string, Map<string, number[]>>()
  const order: string[] = []

  for (const record of records) {
    const raw = xField ? record.cells[xField.id] ?? null : null
    const label = (xField ? formatCellValue(xField, raw, t) : '') || t('database.chart.emptyGroup')
    let series = groups.get(label)
    if (!series) {
      series = new Map()
      groups.set(label, series)
      order.push(label)
    }
    if (!valueFields.length) {
      const values = series.get('count') ?? []
      values.push(1)
      series.set('count', values)
      continue
    }
    for (const field of valueFields) {
      const value = record.cells[field.id]
      if (typeof value !== 'number') continue
      const values = series.get(field.id) ?? []
      values.push(value)
      series.set(field.id, values)
    }
  }

  return order.flatMap(label => {
    const series = groups.get(label)!
    if (!valueFields.length) {
      return [{ x: label, y: series.get('count')?.length ?? 0, series: t('database.chart.yFieldCount') }]
    }
    return valueFields.map(field => ({
      x: label,
      y: aggregateValues(series.get(field.id) ?? [], chart.aggregate),
      series: field.name,
    }))
  })
}
