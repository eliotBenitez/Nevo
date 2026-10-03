import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import { createMermaidNodeView } from '../node-views/mermaid'
import { createVegaNodeView } from '../node-views/vega'
import { createMarkmapNodeView } from '../node-views/markmap'
import { MAX_EMBED_SOURCE_CHARS } from '../node-views/embedLimits'

const { mermaidRender, vegaEmbed, transformMarkmap } = vi.hoisted(() => ({
  mermaidRender: vi.fn(async () => ({ svg: '<svg></svg>' })),
  vegaEmbed: vi.fn(async () => ({ view: { finalize: vi.fn() } })),
  transformMarkmap: vi.fn(async () => ({
    view: { Markmap: { create: vi.fn() } },
    root: {},
    options: {},
  })),
}))

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: mermaidRender },
}))
vi.mock('vega-embed', () => ({ default: vegaEmbed }))
vi.mock('../../utils/markmap/markmapCore', () => ({ transformMarkmap }))

// No IntersectionObserver in this environment: createViewportRenderController
// falls back to activating (and rendering) on the next microtask.
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('ResizeObserver', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

function mountAndFlush(dom: HTMLElement) {
  const root = document.createElement('div')
  root.className = 'doc-body'
  root.append(dom)
  document.body.append(root)
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve())
}

describe('heavy embed node views skip rendering above the source-size limit', () => {
  it('mermaid: never calls mermaid.render and shows the too-large placeholder', async () => {
    const oversized = 'graph TD\n' + 'A-->B\n'.repeat(Math.ceil(MAX_EMBED_SOURCE_CHARS / 6) + 1)
    expect(oversized.length).toBeGreaterThan(MAX_EMBED_SOURCE_CHARS)
    const node = nevoBaseSchema.nodes.mermaid_block!.create({ code: oversized })
    const nodeView = createMermaidNodeView(node, {} as EditorView, false, {
      t: (key) => (key === 'editor.embeds.sourceTooLarge' ? 'Too large' : key),
    })
    await mountAndFlush(nodeView.dom)

    expect(mermaidRender).not.toHaveBeenCalled()
    expect(nodeView.dom.dataset.error).toBe('true')
    expect(nodeView.dom.querySelector('.nv-mermaid-render')?.textContent).toBe('Too large')
    nodeView.destroy?.()
  })

  it('vega: never calls vega-embed and shows the too-large placeholder', async () => {
    const oversized = JSON.stringify({ mark: 'bar', pad: 'x'.repeat(MAX_EMBED_SOURCE_CHARS) })
    expect(oversized.length).toBeGreaterThan(MAX_EMBED_SOURCE_CHARS)
    const node = nevoBaseSchema.nodes.vega_block!.create({ spec: oversized })
    const nodeView = createVegaNodeView(node, {} as EditorView, false, {
      t: (key) => (key === 'editor.embeds.sourceTooLarge' ? 'Too large' : key),
    })
    await mountAndFlush(nodeView.dom)

    expect(vegaEmbed).not.toHaveBeenCalled()
    expect(nodeView.dom.dataset.error).toBe('true')
    expect(nodeView.dom.querySelector('.nv-vega-render')?.textContent).toBe('Too large')
    nodeView.destroy?.()
  })

  it('markmap: never calls transformMarkmap and shows the too-large placeholder', async () => {
    const oversized = '# Topic\n' + '## Idea\n'.repeat(Math.ceil(MAX_EMBED_SOURCE_CHARS / 8) + 1)
    expect(oversized.length).toBeGreaterThan(MAX_EMBED_SOURCE_CHARS)
    const node = nevoBaseSchema.nodes.markmap_block!.create({ markdown: oversized })
    const nodeView = createMarkmapNodeView(node, {} as EditorView, false, {
      t: (key) => (key === 'editor.embeds.sourceTooLarge' ? 'Too large' : key),
    })
    await mountAndFlush(nodeView.dom)

    expect(transformMarkmap).not.toHaveBeenCalled()
    expect(nodeView.dom.dataset.error).toBe('true')
    expect(nodeView.dom.querySelector('.nv-markmap-placeholder')?.textContent).toBe('Too large')
    nodeView.destroy?.()
  })
})
