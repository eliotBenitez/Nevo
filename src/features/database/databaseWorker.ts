import type { DbAggregate, DbChartConfig, DbField, DbRecord } from '../../types/database-block'
import { visibleRecords } from '../../editor-core/databaseFilterSort'
import { detectDelimiter, inferColumnType, parseCsv } from '../../utils/csv/parseCsv'

export type DatabaseWorkerRequest =
  | { id: number; type: 'csv'; text: string; delimiter?: string }
  | { id: number; type: 'visibleRecords'; records: DbRecord[]; fields: DbField[]; filters: Parameters<typeof visibleRecords>[1]; sorts: Parameters<typeof visibleRecords>[2] }
  | { id: number; type: 'chart'; records: DbRecord[]; fields: DbField[]; chart: DbChartConfig; emptyLabel: string }

function aggregate(values: number[], kind: DbAggregate): number {
  if (kind === 'count') return values.length
  if (!values.length) return 0
  if (kind === 'sum') return values.reduce((sum, value) => sum + value, 0)
  if (kind === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length
  if (kind === 'min') return Math.min(...values)
  return Math.max(...values)
}

self.onmessage = (event: MessageEvent<DatabaseWorkerRequest>) => {
  const request = event.data
  if (request.type === 'csv') {
    const delimiter = request.delimiter ?? detectDelimiter(request.text)
    const parsed = parseCsv(request.text, delimiter)
    const types = parsed.headers.map((_, index) => inferColumnType(parsed.rows.map(row => row[index] ?? '')))
    self.postMessage({ id: request.id, ok: true, result: { ...parsed, delimiter, types } })
    return
  }
  if (request.type === 'visibleRecords') {
    self.postMessage({ id: request.id, ok: true, result: visibleRecords(request.records, request.filters, request.sorts, request.fields) })
    return
  }
  const xField = request.fields.find(field => field.id === request.chart.xField)
  const selectedYFields = request.chart.series !== undefined
    ? request.chart.series.map(series => series.fieldId)
    : request.chart.yFields?.length
      ? request.chart.yFields
      : request.chart.yField ? [request.chart.yField] : []
  const yFields = request.fields.filter(field => selectedYFields.includes(field.id) && field.type === 'number')
  const groups = new Map<string, Map<string, number[]>>()
  for (const record of request.records) {
    const label = String(xField ? record.cells[xField.id] ?? request.emptyLabel : request.emptyLabel)
    const series = groups.get(label) ?? new Map<string, number[]>()
    if (!yFields.length) {
      const values = series.get('Count') ?? []
      values.push(1)
      series.set('Count', values)
    } else {
      for (const yField of yFields) {
        const value = record.cells[yField.id]
        if (typeof value !== 'number') continue
        const values = series.get(yField.id) ?? []
        values.push(value)
        series.set(yField.id, values)
      }
    }
    groups.set(label, series)
  }
  const rows = [...groups.entries()].flatMap(([x, series]) => [...series.entries()].map(([fieldId, values]) => ({
    x,
    y: aggregate(values, yFields.length ? request.chart.aggregate : 'count'),
    series: yFields.find(field => field.id === fieldId)?.name ?? fieldId,
  })))
  // Vega remains readable even for high-cardinality CSV columns.
  rows.sort((a, b) => b.y - a.y)
  const visible = rows.slice(0, 48)
  if (rows.length > visible.length) {
    visible.push({
      x: 'Other',
      y: rows.slice(visible.length).reduce((sum, row) => sum + row.y, 0),
      series: 'Other',
    })
  }
  self.postMessage({ id: request.id, ok: true, result: visible })
}
