import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderVegaToSvg } from './vegaToSvg'

const vegaEmbedMock = vi.hoisted(() => vi.fn())

vi.mock('vega-embed', () => ({
  default: vegaEmbedMock,
}))

describe('renderVegaToSvg', () => {
  let finalizeMock: ReturnType<typeof vi.fn>
  let renderedContainer: HTMLElement | null

  beforeEach(() => {
    document.body.innerHTML = ''
    finalizeMock = vi.fn()
    renderedContainer = null
    vegaEmbedMock.mockReset()
    vegaEmbedMock.mockImplementation(async (container: HTMLElement) => {
      renderedContainer = container
      expect(document.body.contains(container)).toBe(true)

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('width', '10')
      rect.setAttribute('height', '10')
      svg.appendChild(rect)
      container.appendChild(svg)

      return { view: { finalize: finalizeMock } }
    })
  })

  it('renders a valid spec to SVG', async () => {
    const svg = await renderVegaToSvg('{"mark":"bar"}')

    expect(svg).toContain('<svg')
    expect(svg).toContain('<rect')
    expect(vegaEmbedMock).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      { mark: 'bar' },
      { actions: false, renderer: 'svg', theme: undefined },
    )
    expect(finalizeMock).toHaveBeenCalledOnce()
    expect(renderedContainer).not.toBeNull()
    expect(document.body.contains(renderedContainer as HTMLElement)).toBe(false)
  })

  it('removes the renderer background while preserving explicit chart fills and dimensions', async () => {
    vegaEmbedMock.mockImplementationOnce(async (container: HTMLElement) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '240')
      svg.setAttribute('height', '160')
      svg.style.backgroundColor = 'rgb(0, 0, 255)'

      const plot = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      plot.setAttribute('fill', '#eef2ff')
      plot.setAttribute('stroke', '#334155')
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      mark.setAttribute('fill', '#2563eb')
      mark.setAttribute('stroke', '#1e3a8a')
      svg.append(plot, mark)
      container.appendChild(svg)
      return { view: { finalize: finalizeMock } }
    })

    const markup = await renderVegaToSvg('{"mark":"bar"}')
    const exportedSvg = new DOMParser().parseFromString(markup ?? '', 'image/svg+xml').documentElement

    expect(exportedSvg.style.backgroundColor).toBe('transparent')
    expect(exportedSvg.getAttribute('width')).toBe('240')
    expect(exportedSvg.getAttribute('height')).toBe('160')
    expect(exportedSvg.querySelector('rect')?.getAttribute('fill')).toBe('#eef2ff')
    expect(exportedSvg.querySelector('rect')?.getAttribute('stroke')).toBe('#334155')
    expect(exportedSvg.querySelector('path')?.getAttribute('fill')).toBe('#2563eb')
    expect(exportedSvg.querySelector('path')?.getAttribute('stroke')).toBe('#1e3a8a')
  })

  it('returns null for empty, default and invalid specs', async () => {
    await expect(renderVegaToSvg('')).resolves.toBeNull()
    await expect(renderVegaToSvg('   ')).resolves.toBeNull()
    await expect(renderVegaToSvg('{}')).resolves.toBeNull()
    await expect(renderVegaToSvg('{')).resolves.toBeNull()

    expect(vegaEmbedMock).not.toHaveBeenCalled()
    expect(document.body.children).toHaveLength(0)
  })

  it('removes the DOM container when rendering fails', async () => {
    vegaEmbedMock.mockImplementationOnce(async (container: HTMLElement) => {
      renderedContainer = container
      throw new Error('invalid chart')
    })

    await expect(renderVegaToSvg('{"mark":"bar"}')).resolves.toBeNull()

    expect(renderedContainer).not.toBeNull()
    expect(document.body.contains(renderedContainer as HTMLElement)).toBe(false)
    expect(finalizeMock).not.toHaveBeenCalled()
  })
})
