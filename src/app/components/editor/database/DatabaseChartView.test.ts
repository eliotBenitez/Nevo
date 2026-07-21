import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DatabaseChartView from './DatabaseChartView.vue'
import type { DbChartConfig, DbField } from '../../../../types/database-block'

const fields: DbField[] = [
  { id: 'category', name: 'Category', type: 'text' },
  { id: 'revenue', name: 'Revenue', type: 'number' },
  { id: 'cost', name: 'Cost', type: 'number' },
]

const chart: DbChartConfig = {
  kind: 'bar',
  xField: 'category',
  yField: '',
  yFields: [],
  series: [],
  aggregate: 'sum',
}

describe('DatabaseChartView', () => {
  it('adds every value as an explicit chart series instead of replacing the first one', async () => {
    const wrapper = mount(DatabaseChartView, {
      props: {
        t: (key: string) => key,
        fields,
        records: [],
        chart,
        onOpenCsvImport: () => {},
      },
    })

    await wrapper.get('.nv-db-chart__series-trigger').trigger('click')
    await wrapper.vm.$nextTick()
    await (document.querySelector('.nv-db-chart__add-series') as HTMLButtonElement).click()
    const first = wrapper.emitted('update:chart')?.[0]?.[0] as DbChartConfig
    expect(first.series?.map(series => series.fieldId)).toEqual(['revenue'])

    await wrapper.setProps({ chart: first })
    await (document.querySelector('.nv-db-chart__add-series') as HTMLButtonElement).click()
    const second = wrapper.emitted('update:chart')?.[1]?.[0] as DbChartConfig
    expect(second.series?.map(series => series.fieldId)).toEqual(['revenue', 'cost'])
    wrapper.unmount()
  })
})
