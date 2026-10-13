import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import { createMermaidNodeView } from '../node-views/mermaid'
import { sanitizeMermaidSvg } from '../../utils/sanitizeMermaidSvg'

const { mermaidRender, mermaidInitialize } = vi.hoisted(() => ({
  mermaidRender: vi.fn(async () => ({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480px" height="240px" viewBox="0 0 480 240">
      <style>.node rect { fill: #e8f0fe; stroke: #4285f4; } .edgePath path { fill: none; stroke: #333; }</style>
      <g class="node"><rect width="100" height="40"/><text class="label">Клиент / Браузер</text></g>
      <g class="edgePath"><path d="M0 0L10 10"/></g>
    </svg>`,
  })),
  mermaidInitialize: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: { initialize: mermaidInitialize, render: mermaidRender },
}))

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('ResizeObserver', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

async function renderDiagram() {
  const node = nevoBaseSchema.nodes.mermaid_block!.create({ code: 'graph TD; A-->B' })
  const nodeView = createMermaidNodeView(node, {} as EditorView, false)
  document.body.append(nodeView.dom)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await vi.waitFor(() => expect(mermaidRender).toHaveBeenCalled())
  await Promise.resolve()
  return nodeView
}

describe('Mermaid node view SVG rendering', () => {
  it('preserves native labels, safe class styling, unfilled edges, and intrinsic sizing', async () => {
    const nodeView = await renderDiagram()
    const svg = nodeView.dom.querySelector('.nv-mermaid-render svg')!

    expect(svg.querySelector('text')?.textContent).toBe('Клиент / Браузер')
    expect(svg.querySelector('rect')?.getAttribute('fill')).toMatch(/^(#e8f0fe|rgb\(232, 240, 254\))$/)
    expect(svg.querySelector('rect')?.getAttribute('stroke')).toMatch(/^(#4285f4|rgb\(66, 133, 244\))$/)
    expect(svg.querySelector('path')?.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('width')).toBe('480px')
    expect(svg.getAttribute('height')).toBe('240px')
    expect(svg.getAttribute('viewBox')).toBe('0 0 480 240')
    expect(svg.querySelector('style')).toBeNull()
    expect(mermaidInitialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    }))
    nodeView.destroy?.()
  })

  it('removes malicious CSS and handlers without affecting surrounding document styles', async () => {
    mermaidRender.mockResolvedValueOnce({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <style>.node { fill: url(https://evil.example/a); color: red; }</style>
        <g class="node"><rect width="10" height="10"/><text>Safe label</text></g>
        <image href="https://evil.example/pixel.png"/>
      </svg>`,
    })
    const outside = document.createElement('div')
    outside.className = 'node'
    document.body.append(outside)
    const nodeView = await renderDiagram()
    const svg = nodeView.dom.querySelector('.nv-mermaid-render svg')!

    expect(svg.getAttribute('onload')).toBeNull()
    expect(svg.querySelector('style')).toBeNull()
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBeNull()
    expect(svg.querySelector('rect')?.getAttribute('color')).toBeNull()
    expect(svg.querySelector('image')?.hasAttribute('href')).toBe(false)
    expect(outside.getAttribute('style')).toBeNull()
    nodeView.destroy?.()
  })

  it('keeps inline style precedence and local SVG marker references', async () => {
    mermaidRender.mockResolvedValueOnce({
      svg: `<svg xmlns="http://www.w3.org/2000/svg">
        <defs><clipPath id="clip"><rect width="5" height="5"/></clipPath></defs>
        <style>.node rect { fill: #eeeeee; clip-path: url(#clip); }</style>
        <g class="node"><rect style="fill: #ff0000" width="10" height="10"/></g>
      </svg>`,
    })
    const nodeView = await renderDiagram()
    const rect = nodeView.dom.querySelector('.nv-mermaid-render g.node > rect')!

    expect(rect.getAttribute('fill')).toMatch(/^(#ff0000|rgb\(255, 0, 0\))$/)
    expect(rect.getAttribute('clip-path')).toMatch(/^url\(["']?#clip["']?\)$/)
    expect(nodeView.dom.querySelector('[data-mermaid-style]')).toBeNull()
    nodeView.destroy?.()
  })

  it('rejects escaped external CSS URLs and oversized SVG before parsing', () => {
    const escapedUrl = sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg">
      <style>.node { fill: url(\\68 ttps://evil.example/a); }</style>
      <rect class="node" width="10" height="10"/>
    </svg>`)
    expect(escapedUrl).not.toContain('evil.example')
    expect(escapedUrl).not.toContain('fill=')
    expect(sanitizeMermaidSvg(`<svg>${' '.repeat(2 * 1024 * 1024)}</svg>`)).toBe('')
  })

  it('applies stylesheet rules in source order', () => {
    const clean = sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg">
      <style>.node rect { fill: #ff0000; } .node rect { fill: #0000ff; }</style>
      <g class="node"><rect width="10" height="10"/></g>
    </svg>`)
    const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml')

    expect(parsed.querySelector('rect')?.getAttribute('fill')).toMatch(/^(#0000ff|rgb\(0, 0, 255\))$/)
  })
})
