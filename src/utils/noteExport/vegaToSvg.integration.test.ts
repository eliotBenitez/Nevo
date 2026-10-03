import { describe, expect, it } from 'vitest'
import vegaEmbed, { type VisualizationSpec } from 'vega-embed'
import { renderVegaToSvg } from './vegaToSvg'

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  width: 240,
  height: 160,
  background: '#0000ff',
  data: { values: [{ category: 'A', value: 4 }] },
  mark: { type: 'bar', color: '#2563eb' },
  encoding: {
    x: { field: 'category', type: 'nominal' },
    y: { field: 'value', type: 'quantitative' },
  },
}

describe('renderVegaToSvg with Vega', () => {
  it('confirms Vega applies background-color to the outer SVG', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const result = await vegaEmbed(container, spec, { actions: false, renderer: 'svg' })

    expect(container.querySelector('svg')?.style.backgroundColor).toBe('rgb(0, 0, 255)')

    result.view.finalize()
    container.remove()
  })

  it('normalizes the real renderer background and preserves chart marks', async () => {
    const markup = await renderVegaToSvg(JSON.stringify(spec))

    const svg = new DOMParser().parseFromString(markup ?? '', 'image/svg+xml').documentElement

    expect(svg.style.backgroundColor).toBe('transparent')
    expect(svg.querySelector('path[aria-label]')).not.toBeNull()
    expect(markup).toContain('#2563eb')
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0)
  })
})
