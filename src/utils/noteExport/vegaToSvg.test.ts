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
