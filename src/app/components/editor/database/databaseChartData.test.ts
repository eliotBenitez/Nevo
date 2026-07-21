import { describe, expect, it } from 'vitest'
import type { DbChartConfig, DbField, DbRecord } from '../../../../types/database-block'
import { buildDatabaseChartRows, chartSeriesForFields, chartValueFieldIds } from './databaseChartData'

const fields: DbField[] = [
  { id: 'category', name: 'Category', type: 'select', options: [] },
  { id: 'revenue', name: 'Revenue', type: 'number' },
  { id: 'cost', name: 'Cost', type: 'number' },
]

const records: DbRecord[] = [
  { id: 'one', cells: { category: '', revenue: 12, cost: 7 } },
  { id: 'two', cells: { category: '', revenue: 8, cost: 4 } },
]

const chart: DbChartConfig = {
  kind: 'line',
  xField: 'category',
  yField: 'revenue',
  yFields: ['revenue', 'cost'],
  aggregate: 'sum',
}

describe('databaseChartData', () => {
  it('preserves each selected numeric field as a separate chart series', () => {
    const rows = buildDatabaseChartRows(records, fields, chart, key => key)

    expect(rows).toEqual([
      { x: 'database.chart.emptyGroup', y: 20, series: 'Revenue' },
      { x: 'database.chart.emptyGroup', y: 11, series: 'Cost' },
    ])
  })

  it('uses a legacy single yField when multi-series fields are absent', () => {
    expect(chartValueFieldIds({ ...chart, yFields: undefined }, fields)).toEqual(['revenue'])
  })

  it('uses the explicit series list as the single source of selected values', () => {
    const config = {
      ...chart,
      series: [
        { id: 'series-cost', fieldId: 'cost' },
        { id: 'series-revenue', fieldId: 'revenue' },
      ],
    }

    expect(chartSeriesForFields(config, fields)).toEqual(config.series)
    expect(chartValueFieldIds(config, fields)).toEqual(['cost', 'revenue'])
  })
})
